import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReadinessController } from './readiness.controller';
import { ReadinessService } from './readiness.service';

/**
 * Readiness / Coach-MVP (Phase 5). SessionGuard kommt aus dem AuthModule.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReadinessController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class ReadinessModule {}
