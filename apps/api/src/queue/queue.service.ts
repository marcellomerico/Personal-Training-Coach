import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createLogger, loadEnv } from '@ptc/config';
import { GARMIN_SYNC_QUEUE, type GarminSyncJobData } from '@ptc/ingest';
import PgBoss from 'pg-boss';

/**
 * pg-boss-Producer der API. Startet einmal beim Modul-Init eine Verbindung,
 * stellt die geteilte `garmin-sync`-Queue sicher (idempotent, der Worker tut
 * dasselbe) und sendet Jobs. Die Verarbeitung passiert ausschliesslich im
 * Worker – die API ist hier nur Producer.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly env = loadEnv();
  private readonly logger = createLogger('queue');
  private boss: PgBoss | null = null;

  async onModuleInit(): Promise<void> {
    const boss = new PgBoss(this.env.DATABASE_URL);
    boss.on('error', (err) => this.logger.error({ err }, 'pg-boss Fehler'));
    await boss.start();
    await boss.createQueue(GARMIN_SYNC_QUEUE);
    this.boss = boss;
    this.logger.info('pg-boss Producer gestartet');
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop();
    this.boss = null;
  }

  /** Sendet einen Garmin-Sync-Job an den Worker; liefert die pg-boss-Job-ID. */
  async enqueueGarminSync(data: GarminSyncJobData): Promise<string | null> {
    if (!this.boss) {
      throw new Error('Queue ist nicht initialisiert.');
    }
    return this.boss.send(GARMIN_SYNC_QUEUE, data);
  }
}
