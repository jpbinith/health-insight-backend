import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiseaseHistoryController } from './disease-history.controller';
import { DiseaseHistoryService } from './disease-history.service';
import {
  DiseaseHistory,
  DiseaseHistorySchema,
} from './schemas/disease-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DiseaseHistory.name, schema: DiseaseHistorySchema },
    ]),
  ],
  controllers: [DiseaseHistoryController],
  providers: [DiseaseHistoryService],
})
export class DiseaseHistoryModule {}
