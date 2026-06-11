import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/**
 * Stellt die optionale Erklärungsschicht (Claude) bereit. Standardmäßig
 * deaktiviert (LLM_ENABLED=false) – dann liefert der Service null.
 */
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
