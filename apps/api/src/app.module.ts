import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { GarminModule } from './garmin/garmin.module';
import { BotApiModule } from './bot/bot-api.module';
import { ReadinessModule } from './readiness/readiness.module';
import { CoachModule } from './coach/coach.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    GarminModule,
    BotApiModule,
    ReadinessModule,
    CoachModule,
  ],
})
export class AppModule {}
