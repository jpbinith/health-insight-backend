import { ObjectId } from 'mongodb';

export interface UserDocument {
  _id?: ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}
