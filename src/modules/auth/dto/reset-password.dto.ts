import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  token!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
