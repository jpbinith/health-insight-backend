import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'skin_diseases', versionKey: false })
export class SkinDisease {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: [String], default: [] })
  symptoms!: string[];

  @Prop({ type: [String], default: [] })
  images!: string[];
}

export type SkinDiseaseDocument = HydratedDocument<SkinDisease>;

export const SkinDiseaseSchema = SchemaFactory.createForClass(SkinDisease);
