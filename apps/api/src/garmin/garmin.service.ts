import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createLogger,
  decryptJsonSecret,
  encryptJsonSecret,
  loadEnv,
  SecretEncryptionError,
} from '@ptc/config';
import { GarminConnector } from '@ptc/connectors';
import {
  assertGarminSessionForRealAccount,
  GarminSessionRequiredError,
  runTrackedGarminSync,
  type SyncStats,
} from '@ptc/ingest';
import { Prisma, type ProviderAccount, type SyncJob } from '@ptc/db';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

const GARMIN_PROVIDER = 'garmin_unofficial' as const;

export interface ListQuery {
  from?: string;
  to?: string;
  limit?: number;
}

export interface GarminCapabilities {
  stubMode: boolean;
  providerMode: 'stub' | 'real';
  webLoginSupported: boolean;
}

export interface GarminAuthStartResult {
  mode: 'stub' | 'real';
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

export interface SyncJobSummary {
  id: string;
  status: string;
  type: string;
  rangeFrom: Date | null;
  rangeTo: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  error: string | null;
  stats: Prisma.JsonValue | null;
  attempt: number;
  createdAt: Date;
}

export interface GarminSyncResult {
  stats: SyncStats;
  syncJob: SyncJobSummary;
}

export interface GarminConnectionStatus {
  connected: boolean;
  providerAccountId: string | null;
  status: string | null;
  authMode: string | null;
  externalUserId: string | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
}

@Injectable()
export class GarminService {
  private readonly env = loadEnv();
  private readonly logger = createLogger('garmin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async getCapabilities(): Promise<GarminCapabilities> {
    try {
      const res = await fetch(`${this.env.GARMIN_CONNECTOR_URL}/health`, {
        signal: AbortSignal.timeout(3_000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        stubMode?: boolean;
        providerMode?: string;
      };
      const stubMode = json.stubMode !== false;
      const providerMode = json.providerMode === 'real' ? 'real' : 'stub';
      return {
        stubMode,
        providerMode,
        webLoginSupported: providerMode === 'real',
      };
    } catch (err) {
      this.logger.warn({ err }, 'Garmin-Connector-Capabilities nicht abrufbar');
      throw new ServiceUnavailableException(
        'Garmin-Connector ist nicht erreichbar. Läuft pnpm dev:all?',
      );
    }
  }

  async startAuth(body: { email?: string; password?: string }): Promise<GarminAuthStartResult> {
    return this.connector().startAuth(body);
  }

  async completeAuth(
    userId: string,
    body: { challengeId: string; mfaCode: string },
  ): Promise<GarminAuthCompleteResult> {
    const auth = await this.connector().completeAuth(body);
    const encryptedSecrets = this.encryptProviderSecrets(auth.secrets);
    // Modus aus der Connector-Antwort übernehmen (stub | real), statt hart zu
    // kodieren – so spiegelt authMode den tatsächlichen Connector-Modus wider.
    const authMode = `unofficial_${auth.mode ?? 'stub'}`;

    const account = await this.prisma.providerAccount.upsert({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
      create: {
        userId,
        provider: GARMIN_PROVIDER,
        authMode,
        externalUserId: auth.externalUserId,
        status: 'connected',
        secrets: encryptedSecrets,
        connectedAt: new Date(auth.connectedAt),
      },
      update: {
        authMode,
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
      authMode: account.authMode ?? authMode,
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

  /**
   * Liefert den Verbindungsstatus des Garmin-Accounts direkt aus dem
   * ProviderAccount – unabhängig davon, ob schon Daten gesynct wurden.
   */
  async getStatus(userId: string): Promise<GarminConnectionStatus> {
    const account = await this.prisma.providerAccount.findUnique({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
    });
    if (!account) {
      return {
        connected: false,
        providerAccountId: null,
        status: null,
        authMode: null,
        externalUserId: null,
        connectedAt: null,
        lastSyncAt: null,
      };
    }
    return {
      connected: account.status === 'connected',
      providerAccountId: account.id,
      status: account.status,
      authMode: account.authMode,
      externalUserId: account.externalUserId,
      connectedAt: account.connectedAt,
      lastSyncAt: account.lastSyncAt,
    };
  }

  /** Startet einen synchronen Sync (Stub) und liefert die Import-Statistik. */
  async sync(userId: string, since: Date | null): Promise<GarminSyncResult> {
    const account = await this.prisma.providerAccount.findUnique({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
    });
    if (!account) {
      throw new BadRequestException(
        'Garmin ist nicht verbunden. Zuerst den Garmin-Auth-Flow abschliessen.',
      );
    }

    const session = this.decryptSession(account);
    try {
      assertGarminSessionForRealAccount(account.authMode, session);
    } catch (err) {
      if (err instanceof GarminSessionRequiredError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    const result = await runTrackedGarminSync(
      this.prisma,
      this.connector(session),
      {
        userId,
        providerAccountId: account.id,
        externalUserId: account.externalUserId,
        since,
      },
      this.logger,
    );
    return { stats: result.stats, syncJob: this.toSyncJobSummary(result.syncJob) };
  }

  /**
   * Legt einen `queued` SyncJob an und sendet ihn an den Worker (pg-boss).
   * Der Worker aktualisiert denselben SyncJob via `syncJobId` auf
   * running -> success/failed. Antwortet sofort, ohne auf den Sync zu warten.
   */
  async enqueueSync(userId: string, since: Date | null): Promise<SyncJobSummary> {
    const account = await this.prisma.providerAccount.findUnique({
      where: { userId_provider: { userId, provider: GARMIN_PROVIDER } },
    });
    if (!account) {
      throw new BadRequestException(
        'Garmin ist nicht verbunden. Zuerst den Garmin-Auth-Flow abschliessen.',
      );
    }

    const job = await this.prisma.syncJob.create({
      data: {
        userId,
        providerAccountId: account.id,
        type: 'incremental',
        status: 'queued',
        rangeFrom: since,
        rangeTo: new Date(),
        attempt: 0,
      },
    });

    try {
      await this.queue.enqueueGarminSync({
        userId,
        providerAccountId: account.id,
        externalUserId: account.externalUserId,
        since: since ? since.toISOString() : null,
        syncJobId: job.id,
      });
    } catch (err) {
      // Senden fehlgeschlagen -> Job nicht dauerhaft als `queued` verwaisen lassen.
      const failed = await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: 'Job konnte nicht an die Queue gesendet werden.',
        },
      });
      this.logger.error({ err, syncJobId: job.id, userId }, 'Enqueue fehlgeschlagen');
      throw new ServiceUnavailableException({
        message: 'Garmin-Sync konnte nicht eingereiht werden.',
        syncJob: this.toSyncJobSummary(failed),
      });
    }

    this.logger.info({ syncJobId: job.id, userId }, 'Garmin-Sync eingereiht');
    return this.toSyncJobSummary(job);
  }

  async latestSyncJobs(userId: string, limit = 5): Promise<SyncJobSummary[]> {
    const jobs = await this.prisma.syncJob.findMany({
      where: {
        userId,
        providerAccount: { is: { provider: GARMIN_PROVIDER } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 20),
    });
    return jobs.map((job) => this.toSyncJobSummary(job));
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

  private connector(session?: Record<string, unknown>): GarminConnector {
    return new GarminConnector(
      {
        baseUrl: this.env.GARMIN_CONNECTOR_URL,
        apiKey: this.env.INTERNAL_API_KEY,
        session,
      },
      GARMIN_PROVIDER,
    );
  }

  /**
   * Entschlüsselt die in `provider_accounts.secrets` abgelegte Session, damit
   * der Connector sie beim echten Datenabruf an den Python-Service weiterreicht.
   * Bei fehlenden/ungültigen Secrets wird ohne Session gesynct (Stub-Pfad).
   * Real-Accounts (`unofficial_real`) werden vor dem Sync separat geprüft.
   */
  private decryptSession(account: ProviderAccount): Record<string, unknown> | undefined {
    if (!account.secrets) return undefined;
    try {
      return decryptJsonSecret<Record<string, unknown>>(account.secrets);
    } catch (err) {
      this.logger.warn(
        { providerAccountId: account.id },
        'Garmin-Session konnte nicht entschlüsselt werden; Sync ohne Session.',
      );
      return undefined;
    }
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

  private toSyncJobSummary(job: SyncJob): SyncJobSummary {
    return {
      id: job.id,
      status: job.status,
      type: job.type,
      rangeFrom: job.rangeFrom,
      rangeTo: job.rangeTo,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      error: job.error,
      stats: job.stats,
      attempt: job.attempt,
      createdAt: job.createdAt,
    };
  }
}
