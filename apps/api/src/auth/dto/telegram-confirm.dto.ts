import { IsString, Matches, MinLength } from 'class-validator';

/**
 * Service-zu-Service-Aufruf vom Bot: bestätigt die Verknüpfung anhand des
 * Einmal-Tokens und der vom Bot gemeldeten Telegram-User-ID.
 */
export class TelegramConfirmDto {
  @IsString()
  @MinLength(10)
  token!: string;

  // Telegram-User-IDs können > 2^53 werden -> als String entgegennehmen.
  @IsString()
  @Matches(/^\d{1,20}$/)
  telegramUserId!: string;
}
