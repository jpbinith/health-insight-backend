import { Module } from '@nestjs/common';
import { IrisRecordsController } from './iris-records.controller';
import { IrisRecordsService } from './iris-records.service';

@Module({
  controllers: [IrisRecordsController],
  providers: [IrisRecordsService],
})
export class IrisRecordsModule {}
