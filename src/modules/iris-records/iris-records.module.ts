import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IrisRecordsController } from './iris-records.controller';
import { IrisRecordsService } from './iris-records.service';
import { IrisRecord, IrisRecordSchema } from './schemas/iris-record.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IrisRecord.name, schema: IrisRecordSchema },
    ]),
  ],
  controllers: [IrisRecordsController],
  providers: [IrisRecordsService],
})
export class IrisRecordsModule {}
