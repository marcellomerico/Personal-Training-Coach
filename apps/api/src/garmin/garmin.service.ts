import { BadRequestException, Injectable } from '@nestjs/common';
import { createLogger, loadEnv } from '@ptc/config';
import { GarminConnector } from '@ptc/connectors';
import { runGarminSync, type SyncStats } from '@ptc/ingest';
import { Prisma } from '@ptc/db';
import { PrismaService } from '../prisma/prisma.service';

const GARMIN_PROVIDER = 'garmin_unofficial' as const;

export interface ListQuery {
  from?: string;
  to?: string;
  limit?: number;
}

@Injectable()
export class GarminService {
  private readonly env = loadEnv();
  private readonly logger = createLogger('garmin');

  constructor(private readonly prisma: PrismaService) {}

  /** Verbindet den (Stub-)Garmin-Account des Nutzers; idempotent. */
  async connect(userId: string): Promise<{ providerAccountId: string; status: string }> {
    const account = await this.prisma.providerAccount.upsert({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
      create: {
        userId,
        provider: GARMIN_PROVIDER,
        authMode: 'unofficial',
        // Im Stub-Modus dient die userId als deterministischer Seed.
        externalUserId: userId,
        status: 'connected',
      },
      update: { status: 'connected' },
    });
    return { providerAccountId: account.id, status: account.status };
  }

  /** Startet einen synchronen Sync (Stub) und liefert die Import-Statistik. */
  async sync(userId: string, since: Date | null): Promise<SyncStats> {
    const account = await this.prisma.providerAccount.findUnique({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
    });
    if (!account) {
      throw new BadRequestException('Garmin ist nicht verbunden. Zuerst /providers/garmin/connect aufrufen.');
    }

    const connector = new GarminConnector(
      { baseUrl: this.env.GARMIN_CONNECTOR_URL, apiKey: this.env.INTERNAL_API_KEY },
      GARMIN_PROVIDER,
    );

    return runGarminSync(
      this.prisma,
      connector,
      {
        userId,
        providerAccountId: account.id,
        externalUserId: account.externalUserId,
        since,
      },
      this.logger,
    );
  }

  async listActivities(userId: string, query: ListQuery) {
    return this.prisma.activity.findMany({
      where: {
        userId,
        startTime: this.dateFilter(query.from, query.to),
      },
      orderBy: { startTime: 'desc' },
      take: this.limit(query.limit),
    });
  }

  async listDailyHealth(userId: string, query: ListQuery) {
    return this.prisma.dailyHealthMetric.findMany({
      where: { userId, date: this.dateFilter(query.from, query.to) },
      orderBy: { date: 'desc' },
      take: this.limit(query.limit),
    });
  }

  async listSleep(userId: string, query: ListQuery) {
    return this.prisma.sleepRecord.findMany({
      where: { userId, date: this.dateFilter(query.from, query.to) },
      orderBy: { date: 'desc' },
      take: this.limit(query.limit),
    });
  }

  private limit(value?: number): number {
    if (!value || value < 1) return 50;
    return Math.min(value, 500);
  }

  private dateFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;
    const filter: Prisma.DateTimeFilter = {};
    if (from) filter.gte = new Date(from);
    if (to) filter.lte = new Date(to);
    return filter;
  }
}
