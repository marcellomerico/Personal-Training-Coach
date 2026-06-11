import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { GarminModule } from './garmin/garmin.module';
import { BotApiModule } from './bot/bot-api.module';
import { ReadinessModule } from './readiness/readiness.module';
import { CoachModule } from './coach/coach.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GarminModule,
    BotApiModule,
    ReadinessModule,
    CoachModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
