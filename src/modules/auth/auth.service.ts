import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserDocument } from '../users/schemas/user.schema';
import { EmailService } from '../email/email.service';
import { getDatabase } from '../../config/mongodb.config';
import { Collection } from 'mongodb';
import { PasswordResetTokenDocument } from './schemas/password-reset-token.schema';
import { createHash, randomBytes } from 'node:crypto';

@Injectable()
export class AuthService {
  private readonly tokenExpiresInSeconds = 60 * 60; // 1 hour
  private readonly resetTokenTtlMs = 15 * 60 * 1000; // 15 minutes
  private readonly logger = new Logger(AuthService.name);
  private passwordResetCollection: Collection<PasswordResetTokenDocument> | null =
    null;
  private passwordResetIndexesEnsured = false;

  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const isPasswordValid = await this.usersService.verifyPassword(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const accessToken = this.createToken(user);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenExpiresInSeconds,
      user: this.sanitizeUser(user),
    };
  }

  async requestPasswordReset(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<void> {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);

    if (!user || !user._id) {
      await this.simulateProcessingDelay();
      return;
    }

    await this.ensurePasswordResetIndexes();

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.resetTokenTtlMs);
    const collection = this.getPasswordResetCollection();

    await collection.deleteMany({ userId: user._id });
    await collection.insertOne({
      userId: user._id,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resetUrl = this.buildResetUrl(token);

    await this.emailService.sendPasswordResetEmail(
      user.email,
      user.fullName,
      resetUrl,
    );

    this.logger.log(`Password reset token issued for user ${user.email}`);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(resetPasswordDto.token);
    const collection = this.getPasswordResetCollection();
    const tokenDocument = await collection.findOne({ tokenHash });

    if (!tokenDocument) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (tokenDocument.expiresAt.getTime() < Date.now()) {
      await collection.deleteMany({ userId: tokenDocument.userId });
      throw new BadRequestException(
        'Invalid or expired password reset token.',
      );
    }

    const user = await this.usersService.findById(tokenDocument.userId);

    if (!user || !user._id) {
      this.logger.error(
        `Password reset token references missing user ${tokenDocument.userId.toHexString()}`,
      );
      throw new InternalServerErrorException(
        'Unable to reset password at this time.',
      );
    }

    await this.usersService.updatePassword(
      tokenDocument.userId,
      resetPasswordDto.password,
    );
    await collection.deleteMany({ userId: tokenDocument.userId });

    this.logger.log(`Password reset completed for user ${user.email}`);
  }

  private createToken(user: UserDocument): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new InternalServerErrorException(
        'JWT secret is not configured on the server.',
      );
    }

    const userId = user._id?.toHexString();

    if (!userId) {
      throw new InternalServerErrorException(
        'User record is missing an identifier.',
      );
    }

    const payload = {
      sub: userId,
      email: user.email,
      fullName: user.fullName,
    };

    return sign(payload, secret, { expiresIn: this.tokenExpiresInSeconds });
  }

  private sanitizeUser(user: UserDocument) {
    const userId = user._id?.toHexString();

    if (!userId) {
      throw new InternalServerErrorException(
        'User record is missing an identifier.',
      );
    }

    return {
      id: userId,
      fullName: user.fullName,
      email: user.email,
    };
  }

  private getPasswordResetCollection(): Collection<PasswordResetTokenDocument> {
    if (!this.passwordResetCollection) {
      const db = getDatabase();
      this.passwordResetCollection = db.collection<PasswordResetTokenDocument>(
        'password_reset_tokens',
      );
    }

    return this.passwordResetCollection;
  }

  private async ensurePasswordResetIndexes(): Promise<void> {
    if (this.passwordResetIndexesEnsured) {
      return;
    }

    const collection = this.getPasswordResetCollection();
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await collection.createIndex({ userId: 1 });
    await collection.createIndex({ tokenHash: 1 }, { unique: true });
    this.passwordResetIndexesEnsured = true;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildResetUrl(token: string): string {
    const baseUrl = process.env.APP_RESET_PASSWORD_URL;

    if (!baseUrl) {
      throw new InternalServerErrorException(
        'APP_RESET_PASSWORD_URL environment variable is not defined.',
      );
    }

    try {
      const url = new URL(baseUrl);
      url.searchParams.set('token', token);
      return url.toString();
    } catch (error) {
      throw new InternalServerErrorException(
        'APP_RESET_PASSWORD_URL environment variable is not a valid URL.',
      );
    }
  }

  private async simulateProcessingDelay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
