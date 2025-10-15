import { ObjectId } from 'mongodb';

export interface PasswordResetTokenDocument {
  _id?: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
