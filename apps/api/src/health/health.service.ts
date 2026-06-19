import { Injectable } from '@nestjs/common';
import { loadEnv } from '@ptc/config';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthCheckResult {
  ok: boolean;
  detail?: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  service: string;
  time: string;
  checks: Record<string, HealthCheckResult>;
}

export interface OpsSummaryResponse {
  service: string;
  time: string;
  syncJobs24h: {
    failed: number;
    success: number;
    queued: number;
    running: number;
  };
  garminConnector: {
    reachable: boolean;
    stubMode: boolean | null;
    providerMode: string | null;
  };
}

@Injectable()
export class HealthService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, garminConnector] = await Promise.all([
      this.checkDatabase(),
      this.checkGarminConnector(),
    ]);

    const checks = { database, garminConnector };
    const status = Object.values(checks).every((c) => c.ok) ? 'ok' : 'degraded';

    return {
      status,
      service: 'api',
      time: new Date().toISOString(),
      checks,
    };
  }

  async opsSummary(): Promise<OpsSummaryResponse> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [failed, success, queued, running, garmin] = await Promise.all([
      this.prisma.syncJob.count({ where: { createdAt: { gte: since }, status: 'failed' } }),
      this.prisma.syncJob.count({ where: { createdAt: { gte: since }, status: 'success' } }),
      this.prisma.syncJob.count({ where: { createdAt: { gte: since }, status: 'queued' } }),
      this.prisma.syncJob.count({ where: { createdAt: { gte: since }, status: 'running' } }),
      this.fetchGarminHealth(),
    ]);

    return {
      service: 'api',
      time: new Date().toISOString(),
      syncJobs24h: { failed, success, queued, running },
      garminConnector: {
        reachable: garmin !== null,
        stubMode: garmin?.stubMode ?? null,
        providerMode: garmin?.providerMode ?? null,
      },
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : 'Datenbank nicht erreichbar',
      };
    }
  }

  private async checkGarminConnector(): Promise<HealthCheckResult> {
    const garmin = await this.fetchGarminHealth();
    if (!garmin) {
      return { ok: false, detail: 'Garmin-Connector nicht erreichbar' };
    }
    return {
      ok: true,
      detail: `stubMode=${String(garmin.stubMode)}, provider=${garmin.providerMode ?? 'unknown'}`,
    };
  }

  private async fetchGarminHealth(): Promise<{
    stubMode?: boolean;
    providerMode?: string;
  } | null> {
    try {
      const res = await fetch(`${this.env.GARMIN_CONNECTOR_URL}/health`, {
        signal: AbortSignal.timeout(3_000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { stubMode?: boolean; providerMode?: string };
      return json;
    } catch {
      return null;
    }
  }
}
