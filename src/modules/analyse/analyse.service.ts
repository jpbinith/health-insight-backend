import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3BucketName, getS3Client } from '../../config/s3.config';
import type { UploadedImageFile } from '../iris-records/types/uploaded-image-file';

interface AnalysisScore {
  label: string;
  probability: number;
}

export interface SkinConditionResult {
  id: string;
  title: string;
  label: string;
  confidence: number;
  description: string;
  symptoms: string[];
  galleryImages: Array<{ src: string; alt: string }>;
  isTopMatch?: boolean;
}

@Injectable()
export class AnalyseService {
  private readonly logger = new Logger(AnalyseService.name);
  private sessionPromise: Promise<ort.InferenceSession> | null = null;
  private classes: string[] | null = null;
  private inputName: string | null = null;
  private outputName: string | null = null;
  private imageWidth = 256;
  private imageHeight = 256;

  async analyse(file: UploadedImageFile | undefined) {
    if (!file) {
      throw new BadRequestException('Image file is required.');
    }

    const session = await this.getSession();
    const classes = this.getClasses();
    const tensor = await this.preprocessImage(file.buffer);

    const start = performance.now();
    const feeds: Record<string, ort.Tensor> = {
      [this.inputName ?? session.inputNames[0]]: tensor,
    };

    const results = await session.run(feeds);
    const outputKey =
      this.outputName ?? session.outputNames?.[0] ?? Object.keys(results)[0];
    const outputTensor = results[outputKey];

    if (!outputTensor) {
      throw new InternalServerErrorException(
        'Model inference did not return any outputs.',
      );
    }

    const logits = Array.from(outputTensor.data as Float32Array);
    const probabilities = this.softmax(logits);
    const predictions: AnalysisScore[] = classes.map((label, index) => ({
      label,
      probability: probabilities[index] ?? 0,
    }));

    predictions.sort((a, b) => b.probability - a.probability);

    const durationMs = performance.now() - start;
    this.logger.debug(
      `Inference completed in ${durationMs.toFixed(1)}ms. Top prediction: ${
        predictions[0]?.label ?? 'unknown'
      }`,
    );

    const topThree = predictions.slice(0, 3);
    return this.buildSkinConditionResults(topThree);
  }

  private async getSession(): Promise<ort.InferenceSession> {
    if (!this.sessionPromise) {
      const modelPath = this.resolveAssetPath('best_model.onnx');
      this.logger.log(`Loading ONNX model from ${modelPath}`);
      this.sessionPromise = ort.InferenceSession.create(modelPath)
        .then((session) => {
          this.inputName = session.inputNames?.[0] ?? null;
          this.outputName = session.outputNames?.[0] ?? null;

          const metadataEntry = this.resolveInputMetadata(session);
          const shape = metadataEntry?.shape ?? metadataEntry?.dimensions ?? [];
          this.logger.debug(`Model input shape metadata: ${JSON.stringify(shape)}`);
          const heightRaw = shape[2];
          const widthRaw = shape[3];
          const height =
            typeof heightRaw === 'number'
              ? heightRaw
              : typeof heightRaw === 'string'
                ? Number.parseInt(heightRaw, 10)
                : undefined;
          const width =
            typeof widthRaw === 'number'
              ? widthRaw
              : typeof widthRaw === 'string'
                ? Number.parseInt(widthRaw, 10)
                : undefined;
          if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
            this.imageHeight = height;
          }
          if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
            this.imageWidth = width;
          }
          this.logger.log(
            `Model expects input dimensions ${this.imageWidth}x${this.imageHeight}`,
          );

          return session;
        })
        .catch((error) => {
          this.logger.error('Failed to load ONNX model', error);
          throw new InternalServerErrorException(
            'Unable to load prediction model.',
            { cause: error },
          );
        });
    }

    return this.sessionPromise;
  }

  private resolveInputMetadata(
    session: ort.InferenceSession,
  ):
    | {
        name?: string;
        shape?: Array<number | string>;
        dimensions?: Array<number | string>;
      }
    | undefined {
    const metadata = session.inputMetadata;
    if (!metadata) {
      return undefined;
    }

    if (Array.isArray(metadata)) {
      if (this.inputName) {
        return metadata.find((entry) => entry.name === this.inputName);
      }
      return metadata[0];
    }

    if (this.inputName && metadata[this.inputName]) {
      return metadata[this.inputName] as {
        name?: string;
        shape?: Array<number | string>;
        dimensions?: Array<number | string>;
      };
    }

    const firstKey = Object.keys(metadata)[0];
    if (firstKey) {
      return metadata[firstKey] as {
        name?: string;
        shape?: Array<number | string>;
        dimensions?: Array<number | string>;
      };
    }

    return undefined;
  }

  private getClasses(): string[] {
    if (!this.classes) {
      const classesPath = this.resolveAssetPath('classes.json');
      const raw = readFileSync(classesPath, 'utf-8');
      this.classes = JSON.parse(raw);
    }

    if (!this.classes) {
      throw new InternalServerErrorException('Unable to load class labels.');
    }

    return this.classes;
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<ort.Tensor> {
    try {
      const resized = await sharp(imageBuffer)
        .resize(this.imageWidth, this.imageHeight, {
          fit: 'cover',
        })
        .removeAlpha()
        .raw()
        .toBuffer();

      const pixelCount = this.imageWidth * this.imageHeight;
      const floatData = new Float32Array(3 * pixelCount);
      for (let i = 0; i < pixelCount; i += 1) {
        const r = resized[i * 3];
        const g = resized[i * 3 + 1];
        const b = resized[i * 3 + 2];

        floatData[i] = r / 255;
        floatData[i + pixelCount] = g / 255;
        floatData[i + 2 * pixelCount] = b / 255;
      }

      return new ort.Tensor('float32', floatData, [
        1,
        3,
        this.imageHeight,
        this.imageWidth,
      ]);
    } catch (error) {
      this.logger.error('Failed to preprocess image for inference', error);
      throw new BadRequestException('Unable to process uploaded image.');
    }
  }

  private softmax(values: number[]): number[] {
    const max = Math.max(...values);
    const exps = values.map((value) => Math.exp(value - max));
    const sum = exps.reduce((acc, value) => acc + value, 0);
    return exps.map((value) => value / sum);
  }

  private resolveAssetPath(filename: string): string {
    const distPath = resolve(process.cwd(), 'dist', 'models', filename);
    if (existsSync(distPath)) {
      return distPath;
    }

    const srcPath = resolve(process.cwd(), 'src', 'models', filename);
    if (existsSync(srcPath)) {
      return srcPath;
    }

    const relativeToService = resolve(
      join(__dirname, '..', '..', 'models', filename),
    );
    if (existsSync(relativeToService)) {
      return relativeToService;
    }

    throw new Error(`Unable to locate model asset: ${filename}`);
  }
  private async buildSkinConditionResults(
    predictions: AnalysisScore[],
  ): Promise<SkinConditionResult[]> {
    const placeholderKey = 'skin/tinea/tinea.png';
    const placeholderUrl = await this.getSignedImageUrl(placeholderKey);

    const defaultConditions: Record<string, SkinConditionResult> = {
      eczema: {
        id: 'eczema',
        title: 'Eczema (Atopic Dermatitis)',
        label: 'Top Match',
        confidence: 0,
        description:
          'A chronic inflammatory condition that makes skin red, itchy, and dry. Flares can be triggered by stress, allergens, or irritants and often require ongoing management.',
        symptoms: [
          'Dry, cracked, or scaly patches of skin',
          'Intense itching, often worse at night',
          'Red to brownish-gray patches on hands, feet, neck, and upper chest',
          'Small, raised bumps that may leak fluid when scratched',
        ],
        galleryImages: [
          { src: placeholderUrl, alt: 'Eczema affecting cheek' },
          { src: placeholderUrl, alt: 'Eczema flare on wrist' },
          { src: placeholderUrl, alt: 'Eczema on elbow crease' },
          { src: placeholderUrl, alt: 'Eczema on neck area' },
        ],
        isTopMatch: true,
      },
      psoriasis: {
        id: 'psoriasis',
        title: 'Psoriasis',
        label: 'Prediction #2',
        confidence: 0,
        description:
          'An autoimmune condition that accelerates skin cell turnover, producing thick, silvery scales and dry, itchy plaques. It can flare cyclically with triggers like stress or infections.',
        symptoms: [
          'Raised plaques covered with silvery scales',
          'Dry, cracked skin that may bleed',
          'Itching or soreness around plaques',
          'Thickened or pitted fingernails',
        ],
        galleryImages: [
          { src: placeholderUrl, alt: 'Psoriasis plaque on elbow' },
          { src: placeholderUrl, alt: 'Psoriasis on knees' },
          { src: placeholderUrl, alt: 'Psoriasis affecting scalp' },
        ],
      },
      rosacea: {
        id: 'rosacea',
        title: 'Rosacea',
        label: 'Prediction #3',
        confidence: 0,
        description:
          'A chronic inflammatory facial skin disorder characterized by flushing, visible blood vessels, and sometimes acne-like bumps. Triggers include heat, spicy foods, alcohol, and stress.',
        symptoms: [
          'Persistent redness across the central face',
          'Small, pus-filled bumps resembling acne',
          'Visible facial blood vessels (telangiectasia)',
          'Burning or stinging sensations on the face',
        ],
        galleryImages: [
          { src: placeholderUrl, alt: 'Rosacea redness on cheeks' },
          { src: placeholderUrl, alt: 'Rosacea with visible vessels' },
          { src: placeholderUrl, alt: 'Rosacea flare around nose' },
        ],
      },
    };

    const rankingLabels = ['Top Match', 'Prediction #2', 'Prediction #3'];

    return predictions.map((prediction, index) => {
      const conditionKey = this.mapLabelToConditionId(prediction.label);
      const baseCondition =
        defaultConditions[conditionKey] ??
        {
          id: conditionKey,
          title: prediction.label.replace(/_/g, ' '),
          label: rankingLabels[index] ?? `Prediction #${index + 1}`,
          confidence: 0,
          description:
            'Further information about this condition is not yet available. Consult a healthcare professional for a detailed assessment.',
          symptoms: [
            'Consult a dermatologist for personalized evaluation',
            'Monitor for progression or changes over time',
          ],
          galleryImages: [
            {
              src: placeholderUrl,
              alt: `${prediction.label} representative example`,
            },
          ],
        };

      const confidencePercent = Math.round((prediction.probability ?? 0) * 100);
      return {
        ...baseCondition,
        label: rankingLabels[index] ?? baseCondition.label,
        confidence: confidencePercent,
        isTopMatch: index === 0,
      };
    });
  }

  private mapLabelToConditionId(label: string): string {
    const normalized = label.toLowerCase();
    if (normalized.includes('eczema')) {
      return 'eczema';
    }
    if (normalized.includes('psoriasis')) {
      return 'psoriasis';
    }
    if (normalized.includes('rosacea')) {
      return 'rosacea';
    }
    return normalized.replace(/[^a-z0-9]/g, '-');
  }

  private async getSignedImageUrl(key: string): Promise<string> {
    try {
      const client = getS3Client();
      const bucket = getS3BucketName();
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for ${key}`, error);
      throw new InternalServerErrorException('Unable to generate image URL.', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

}
