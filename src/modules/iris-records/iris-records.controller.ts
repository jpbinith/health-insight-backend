import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateIrisRecordDto } from './dto/create-iris-record.dto';
import { IrisRecordsService } from './iris-records.service';
import type { UploadedImageFile } from './types/uploaded-image-file';

@Controller('iris-records')
export class IrisRecordsController {
  constructor(private readonly irisRecordsService: IrisRecordsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
      },
    }),
  )
  async createRecord(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: CreateIrisRecordDto,
  ) {
    return this.irisRecordsService.create(dto, file);
  }
}
