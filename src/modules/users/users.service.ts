import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { promisify } from 'util';
import {
  randomBytes,
  scrypt as _scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { User, UserDocument } from './schemas/user.schema';

const scrypt = promisify(_scrypt);

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { fullName, email, password } =
      this.normalizeCreateUserPayload(createUserDto);

    const existingUser = await this.userModel.findOne({ email }).lean();
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    const passwordHash = await this.hashPassword(password);

    const user = await this.userModel.create({
      fullName,
      email,
      passwordHash,
    });

    const createdAt =
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : new Date().toISOString();

    const id =
      user._id instanceof Types.ObjectId
        ? user._id.toHexString()
        : String(user._id);

    return {
      id,
      fullName,
      email,
      createdAt,
    };
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
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

  async findById(userId: Types.ObjectId | string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).exec();
  }

  async updatePassword(
    userId: Types.ObjectId | string,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await this.hashPassword(newPassword);
    await this.userModel.findByIdAndUpdate(userId, {
      passwordHash,
    });
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
