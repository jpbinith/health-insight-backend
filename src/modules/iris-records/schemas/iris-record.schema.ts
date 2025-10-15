import { ObjectId } from 'mongodb';

export interface IrisRecordDocument {
  _id?: ObjectId;
  imageKey: string;
  healthIssues: string[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}
