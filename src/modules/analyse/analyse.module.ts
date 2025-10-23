import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnalyseService } from './analyse.service';
import { AnalyseController } from './analyse.controller';
import {
  SkinDisease,
  SkinDiseaseSchema,
} from './schemas/skin-disease.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{
      name: SkinDisease.name,
      schema: SkinDiseaseSchema,
    }]),
  ],
  controllers: [AnalyseController],
  providers: [AnalyseService],
})
export class AnalyseModule {}
