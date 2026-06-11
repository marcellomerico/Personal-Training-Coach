import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GarminModule } from '../garmin/garmin.module';
import { CoachModule } from '../coach/coach.module';
import { BotApiController } from './bot-api.controller';
import { BotApiService } from './bot-api.service';

/**
 * Interne API fuer den Telegram-Bot. Der Bot bleibt eine duenne UI-Schicht
 * und ruft diese Endpunkte mit `x-internal-key` auf.
 */
@Module({
  imports: [AuthModule, GarminModule, CoachModule],
  controllers: [BotApiController],
  providers: [BotApiService],
})
export class BotApiModule {}
