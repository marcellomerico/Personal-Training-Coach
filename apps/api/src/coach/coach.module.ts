import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { CoachController } from './coach.controller';
import { CoachService } from './coach.service';

/**
 * Coach-Empfehlung (Phase 5). Deterministische Tagesempfehlung auf Basis der
 * Readiness, optional erklärt durch die LLM-Schicht (LlmModule).
 * SessionGuard kommt aus dem AuthModule.
 */
@Module({
  imports: [AuthModule, LlmModule],
  controllers: [CoachController],
  providers: [CoachService],
  exports: [CoachService],
})
export class CoachModule {}
