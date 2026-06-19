import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GarminAuthStartDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password?: string;
}

export class GarminAuthCompleteDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  challengeId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  mfaCode!: string;
}
