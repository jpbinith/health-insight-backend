import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getS3BucketName, getS3Client } from '../../config/s3.config';
import { DiseaseHistory, DiseaseHistoryDocument } from './schemas/disease-history.schema';
import { CreateDiseaseHistoryDto } from './dto/create-disease-history.dto';
import { QueryDiseaseHistoryDto } from './dto/query-disease-history.dto';
import type { UploadedImageFile } from '../iris-records/types/uploaded-image-file';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class DiseaseHistoryService {
  private readonly s3 = getS3Client();
  private readonly bucket = getS3BucketName();

  constructor(
    @InjectModel(DiseaseHistory.name)
    private readonly diseaseHistoryModel: Model<DiseaseHistoryDocument>,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateDiseaseHistoryDto,
    file: UploadedImageFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required.');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded image is empty.');
    }

    const fileExtension = extname(file.originalname).toLowerCase() || '.jpeg';
    const objectKey = `history/${randomUUID()}${fileExtension}`;

    await this.uploadToS3(objectKey, file);

    const diseases = dto.diseases.map((entry) => ({
      conditionId: entry.conditionId,
      confidence: entry.confidence,
    }));

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();

    await this.diseaseHistoryModel.create({
      userId: new Types.ObjectId(user.userId),
      diseases,
      occurredAt,
      imageKey: objectKey,
    });

    return;
  }

  async list(user: AuthenticatedUser, query: QueryDiseaseHistoryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const filter = { userId: new Types.ObjectId(user.userId) };

    const [items, total] = await Promise.all([
      this.diseaseHistoryModel
        .find(filter)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.diseaseHistoryModel.countDocuments(filter).exec(),
    ]);

    const data = await Promise.all(
      items.map(async (item) => {
        const imageUrl = await this.generateSignedUrl(item.imageKey);
        const diseaseUrls = await Promise.all(
          item.diseases.map(async (disease) => ({
            conditionId: disease.conditionId,
            confidence: disease.confidence,
            imageUrl,
          })),
        );

        return {
          historyId: item.historyId,
          diseases: diseaseUrls,
          imageUrl,
          occurredAt: item.occurredAt,
          createdAt: item['createdAt'],
          updatedAt: item['updatedAt'],
        };
      }),
    );

    return {
      page,
      limit,
      total,
      data,
    };
  }

  private async uploadToS3(
    key: string,
    file: UploadedImageFile,
  ): Promise<void> {
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (error) {
      throw new InternalServerErrorException('Failed to upload image to storage.', {
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async generateSignedUrl(key: string): Promise<string> {
    if (!key) {
      return '';
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: 60 * 5 });
  }
}
