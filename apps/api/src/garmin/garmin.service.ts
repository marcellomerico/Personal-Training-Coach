import { BadRequestException, Injectable } from '@nestjs/common';
import {
  createLogger,
  encryptJsonSecret,
  loadEnv,
  SecretEncryptionError,
} from '@ptc/config';
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

export interface GarminAuthStartResult {
  mode: 'stub';
  mfaRequired: boolean;
  challengeId: string;
  expiresAt: string;
  message: string;
}

export interface GarminAuthCompleteResult {
  providerAccountId: string;
  status: string;
  externalUserId: string | null;
  authMode: string;
}

@Injectable()
export class GarminService {
  private readonly env = loadEnv();
  private readonly logger = createLogger('garmin');

  constructor(private readonly prisma: PrismaService) {}

  async startAuth(body: { email?: string }): Promise<GarminAuthStartResult> {
    return this.connector().startAuth(body);
  }

  async completeAuth(
    userId: string,
    body: { challengeId: string; mfaCode: string },
  ): Promise<GarminAuthCompleteResult> {
    const auth = await this.connector().completeAuth(body);
    const encryptedSecrets = this.encryptProviderSecrets(auth.secrets);

    const account = await this.prisma.providerAccount.upsert({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
      create: {
        userId,
        provider: GARMIN_PROVIDER,
        authMode: 'unofficial_stub',
        externalUserId: auth.externalUserId,
        status: 'connected',
        secrets: encryptedSecrets,
        connectedAt: new Date(auth.connectedAt),
      },
      update: {
        authMode: 'unofficial_stub',
        externalUserId: auth.externalUserId,
        status: 'connected',
        secrets: encryptedSecrets,
        connectedAt: new Date(auth.connectedAt),
      },
    });

    return {
      providerAccountId: account.id,
      status: account.status,
      externalUserId: account.externalUserId,
      authMode: account.authMode ?? 'unofficial_stub',
    };
  }

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
      throw new BadRequestException(
        'Garmin ist nicht verbunden. Zuerst den Garmin-Auth-Flow abschliessen.',
      );
    }

    return runGarminSync(
      this.prisma,
      this.connector(),
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

  private connector(): GarminConnector {
    return new GarminConnector(
      { baseUrl: this.env.GARMIN_CONNECTOR_URL, apiKey: this.env.INTERNAL_API_KEY },
      GARMIN_PROVIDER,
    );
  }

  private encryptProviderSecrets(secrets: unknown): string {
    try {
      return encryptJsonSecret(secrets);
    } catch (err) {
      if (err instanceof SecretEncryptionError) {
        throw new BadRequestException(
          'ENCRYPTION_KEY muss gesetzt sein, bevor Garmin-Secrets gespeichert werden koennen.',
        );
      }
      throw err;
    }
  }
}
