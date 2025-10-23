import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { sign } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UserDocument } from '../users/schemas/user.schema';
import { EmailService } from '../email/email.service';
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';

@Injectable()
export class AuthService {
  private readonly tokenExpiresInSeconds = 60 * 60; // 1 hour
  private readonly resetTokenTtlMs = 15 * 60 * 1000; // 15 minutes
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetTokenDocument>,
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

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.resetTokenTtlMs);
    const userId = user._id as Types.ObjectId;

    await this.passwordResetTokenModel.deleteMany({ userId });
    await this.passwordResetTokenModel.create({
      userId,
      tokenHash,
      expiresAt,
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
    const tokenDocument = await this.passwordResetTokenModel
      .findOne({ tokenHash })
      .exec();

    if (!tokenDocument) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    if (tokenDocument.expiresAt.getTime() < Date.now()) {
      await this.passwordResetTokenModel.deleteMany({
        userId: tokenDocument.userId,
      });
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
    await this.passwordResetTokenModel.deleteMany({
      userId: tokenDocument.userId,
    });

    this.logger.log(`Password reset completed for user ${user.email}`);
  }

  private createToken(user: UserDocument): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new InternalServerErrorException(
        'JWT secret is not configured on the server.',
      );
    }

    const userId = user._id as Types.ObjectId | undefined;

    if (!userId) {
      throw new InternalServerErrorException(
        'User record is missing an identifier.',
      );
    }

    const payload = {
      sub: userId.toHexString(),
      email: user.email,
      fullName: user.fullName,
    };

    return sign(payload, secret, { expiresIn: this.tokenExpiresInSeconds });
  }

  private sanitizeUser(user: UserDocument) {
    const userId = user._id as Types.ObjectId | undefined;

    if (!userId) {
      throw new InternalServerErrorException(
        'User record is missing an identifier.',
      );
    }

    return {
      id: userId.toHexString(),
      fullName: user.fullName,
      email: user.email,
    };
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
