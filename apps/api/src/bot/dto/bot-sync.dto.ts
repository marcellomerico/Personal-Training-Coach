import { IsOptional, IsString, Matches } from 'class-validator';

export class BotSyncDto {
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegramUserId!: string;

  @IsOptional()
  @IsString()
  since?: string;
}
