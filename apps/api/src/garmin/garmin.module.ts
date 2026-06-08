import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GarminController } from './garmin.controller';
import { GarminService } from './garmin.service';

/**
 * Garmin-Import (Phase 2). Verbindet den (Stub-)Connector, triggert Syncs und
 * stellt Lese-Endpunkte für die normalisierten Daten bereit.
 * SessionGuard kommt aus dem AuthModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [GarminController],
  providers: [GarminService],
  exports: [GarminService],
})
export class GarminModule {}
