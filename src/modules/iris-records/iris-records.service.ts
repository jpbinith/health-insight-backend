import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { getS3BucketName, getS3Client } from '../../config/s3.config';
import { CreateIrisRecordDto } from './dto/create-iris-record.dto';
import {
  IrisRecord,
  IrisRecordDocument,
} from './schemas/iris-record.schema';
import type { UploadedImageFile } from './types/uploaded-image-file';

@Injectable()
export class IrisRecordsService {
  private readonly s3 = getS3Client();
  private readonly bucket = getS3BucketName();

  constructor(
    @InjectModel(IrisRecord.name)
    private readonly irisRecordModel: Model<IrisRecordDocument>,
  ) {}

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
    const objectKey = `eye/${randomUUID()}${fileExtension.toLowerCase()}`;
    const healthIssues = dto.healthIssues.map((issue) => issue.trim());

    await this.uploadToS3(objectKey, file);

    try {
      const record = await this.irisRecordModel.create({
        imageKey: objectKey,
        healthIssues,
        note: dto.note,
      });

      const createdAt =
        record.createdAt instanceof Date
          ? record.createdAt.toISOString()
          : new Date().toISOString();

      const id =
        record._id instanceof Types.ObjectId
          ? record._id.toHexString()
          : String(record._id);

      return {
        id,
        imageKey: objectKey,
        healthIssues,
        note: dto.note,
        createdAt,
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
