import { ConflictException, Injectable } from '@nestjs/common';
import { getDatabase } from '../../config/mongodb.config';
import { CreateUserDto } from './dto/create-user.dto';
import { Collection, ObjectId } from 'mongodb';
import { promisify } from 'util';
import {
  randomBytes,
  scrypt as _scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { UserDocument } from './schemas/user.schema';

const scrypt = promisify(_scrypt);

@Injectable()
export class UsersService {
  private get collection(): Collection<UserDocument> {
    const db = getDatabase();
    return db.collection<UserDocument>('users');
  }

  async create(createUserDto: CreateUserDto) {
    const { fullName, email, password } =
      this.normalizeCreateUserPayload(createUserDto);

    const existingUser = await this.collection.findOne({ email });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await this.hashPassword(password);
    const now = new Date();

    const { insertedId } = await this.collection.insertOne({
      fullName,
      email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: insertedId.toHexString(),
      fullName,
      email,
      createdAt: now.toISOString(),
    };
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.collection.findOne({ email });
  }

  async verifyPassword(
    password: string,
    storedHash: string,
  ): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');

    if (!salt || !hash) {
      throw new Error('Stored password hash is malformed.');
    }

    const derivedKey = (await scrypt(password, salt, 32)) as Buffer;
    const hashBuffer = Buffer.from(hash, 'hex');

    return (
      hashBuffer.length === derivedKey.length &&
      timingSafeEqual(hashBuffer, derivedKey)
    );
  }

  async findById(userId: ObjectId): Promise<UserDocument | null> {
    return this.collection.findOne({ _id: userId });
  }

  async updatePassword(userId: ObjectId, newPassword: string): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await this.collection.updateOne(
      { _id: userId },
      {
        $set: {
          passwordHash,
          updatedAt: new Date(),
        },
      },
    );
  }

  private normalizeCreateUserPayload(dto: CreateUserDto) {
    const fullName = dto.fullName.trim();
    const email = dto.email.trim().toLowerCase();
    const password = dto.password;

    return { fullName, email, password };
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 32)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }
}
