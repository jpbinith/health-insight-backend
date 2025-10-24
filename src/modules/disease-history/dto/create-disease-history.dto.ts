import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DiseaseEntryDto {
  @IsString()
  @IsNotEmpty()
  conditionId!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @Transform(({ value }) => Number(value), { toClassOnly: true })
  confidence!: number;
}

export class CreateDiseaseHistoryDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return plainToInstance(DiseaseEntryDto, parsed ?? []);
      } catch {
        return [];
      }
    }
    if (Array.isArray(value)) {
      return plainToInstance(DiseaseEntryDto, value);
    }
    return [];
  })
  diseases!: DiseaseEntryDto[];

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
