import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { getS3BucketName, getS3Client } from '../../config/s3.config';
import { getDatabase } from '../../config/mongodb.config';
import { CreateIrisRecordDto } from './dto/create-iris-record.dto';
import { Collection } from 'mongodb';
import { IrisRecordDocument } from './schemas/iris-record.schema';
import type { UploadedImageFile } from './types/uploaded-image-file';

@Injectable()
export class IrisRecordsService {
  private readonly s3 = getS3Client();
  private readonly bucket = getS3BucketName();

  private get collection(): Collection<IrisRecordDocument> {
    return getDatabase().collection<IrisRecordDocument>('iris_records');
  }

  async create(
    dto: CreateIrisRecordDto,
    file: UploadedImageFile | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required.');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Uploaded image is empty.');
    }

    const fileExtension = extname(file.originalname) || '';
    const objectKey = `${randomUUID()}${fileExtension.toLowerCase()}`;
    const healthIssues = dto.healthIssues.map((issue) => issue.trim());

    await this.uploadToS3(objectKey, file);

    const now = new Date();
    try {
      const { insertedId } = await this.collection.insertOne({
        imageKey: objectKey,
        healthIssues,
        note: dto.note,
        createdAt: now,
        updatedAt: now,
      });

      return {
        id: insertedId.toHexString(),
        imageKey: objectKey,
        healthIssues,
        note: dto.note,
        createdAt: now.toISOString(),
      };
    } catch (error) {
      await this.cleanupUploadedObject(objectKey);
      throw new InternalServerErrorException(
        'Failed to save iris record.',
        {
          cause: error instanceof Error ? error : undefined,
        },
      );
    }

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
      throw new InternalServerErrorException(
        'Failed to upload image to storage.',
        {
          cause: error instanceof Error ? error : undefined,
        },
      );
    }
  }

  private async cleanupUploadedObject(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch {
      // Swallow cleanup errors so the original failure surfaces.
    }
  }
}
