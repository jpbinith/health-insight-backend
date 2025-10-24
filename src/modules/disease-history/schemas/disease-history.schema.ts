import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';

@Schema({ _id: false })
export class DiseaseEntry {
  @Prop({ required: true })
  conditionId!: string;

  @Prop({ required: true, min: 0, max: 100 })
  confidence!: number; // percentage 0-100
}

export const DiseaseEntrySchema = SchemaFactory.createForClass(DiseaseEntry);

@Schema({ collection: 'disease_history', timestamps: true })
export class DiseaseHistory {
  @Prop({ type: String, unique: true, default: () => randomUUID() })
  historyId!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ type: [DiseaseEntrySchema], required: true })
  diseases!: DiseaseEntry[];

  @Prop({ required: true })
  imageKey!: string;

  @Prop({ type: Date, default: Date.now })
  occurredAt!: Date;
}

export type DiseaseHistoryDocument = HydratedDocument<DiseaseHistory>;

export const DiseaseHistorySchema = SchemaFactory.createForClass(DiseaseHistory);
