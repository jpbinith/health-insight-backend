import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { UploadedImageFile } from '../iris-records/types/uploaded-image-file';
import { DiseaseHistoryService } from './disease-history.service';
import { CreateDiseaseHistoryDto } from './dto/create-disease-history.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { QueryDiseaseHistoryDto } from './dto/query-disease-history.dto';

@Controller('disease-history')
export class DiseaseHistoryController {
  constructor(private readonly diseaseHistoryService: DiseaseHistoryService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async create(
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: CreateDiseaseHistoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.diseaseHistoryService.create(user, dto, file);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDiseaseHistoryDto,
  ) {
    return this.diseaseHistoryService.list(user, query);
  }
}
