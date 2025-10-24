import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { UploadedImageFile } from '../iris-records/types/uploaded-image-file';
import { AnalyseService, SkinConditionResult } from './analyse.service';

@Controller('analyse')
export class AnalyseController {
  constructor(private readonly analyseService: AnalyseService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async analyse(
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<SkinConditionResult[]> {
    return this.analyseService.analyse(file);
  }
}
