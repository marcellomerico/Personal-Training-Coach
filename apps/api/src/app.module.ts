import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { GarminModule } from './garmin/garmin.module';

@Module({
  imports: [PrismaModule, AuthModule, GarminModule],
  controllers: [HealthController],
})
export class AppModule {}
