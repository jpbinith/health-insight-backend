import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { sign } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  private readonly tokenExpiresInSeconds = 60 * 60; // 1 hour

  constructor(private readonly usersService: UsersService) {}

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
}
