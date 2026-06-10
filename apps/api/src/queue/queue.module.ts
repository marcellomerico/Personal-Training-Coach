import { Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * Stellt den pg-boss-Producer (QueueService) bereit. Wird von Modulen
 * importiert, die Jobs an den Worker senden (aktuell: Garmin-Sync).
 */
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
