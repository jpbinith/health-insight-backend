import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true })
export class IrisRecord {
  @Prop({ required: true })
  imageKey!: string;

  @Prop({ type: [String], required: true })
  healthIssues!: string[];

  @Prop()
  note?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type IrisRecordDocument = HydratedDocument<IrisRecord>;

export const IrisRecordSchema = SchemaFactory.createForClass(IrisRecord);
