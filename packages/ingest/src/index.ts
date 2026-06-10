import type { Logger } from '@ptc/config';
import type { ProviderAccount, SourceConnector, SyncResult } from '@ptc/core';
import { Prisma, type PrismaClient, type Provider, type SyncJob } from '@ptc/db';
import { computeAndStoreReadiness } from './readiness';

export { computeAndStoreReadiness } from './readiness';

export interface SyncContext {
  userId: string;
  providerAccountId: string | null;
  externalUserId: string | null;
  /** Nur Daten ab diesem Zeitpunkt holen (null = Standard-Rückblick des Connectors). */
  since: Date | null;
}

export interface SyncStats {
  rawImports: number;
  activities: number;
  dailyHealth: number;
  sleep: number;
}

export interface TrackedSyncResult {
  stats: SyncStats;
  syncJob: SyncJob;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function rawKey(entityType: string, sourceExternalId: string): string {
  return `${entityType}:${sourceExternalId}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Orchestriert einen Garmin-Sync: holt normalisierte Daten über den Connector,
 * speichert Rohdaten (Audit) und schreibt das normalisierte Modell idempotent
 * (Upsert auf den fachlichen Unique-Keys). Wird von API (manuell) und Worker genutzt.
 */
export async function runGarminSync(
  prisma: PrismaClient,
  connector: SourceConnector,
  ctx: SyncContext,
  logger?: Logger,
): Promise<SyncStats> {
  const account: ProviderAccount = {
    id: ctx.providerAccountId ?? '',
    userId: ctx.userId,
    provider: connector.provider,
    externalUserId: ctx.externalUserId,
    status: 'connected',
    connectedAt: null,
    lastSyncAt: null,
    encryptedSecrets: null,
  };

  const result: SyncResult = await connector.fetchSince(account, ctx.since);
  const source = connector.provider as Provider;
  const providerAccountId = ctx.providerAccountId;

  // 1) Rohdaten speichern und je (entityType, externalId) die RawImport-ID merken.
  const rawIdByKey = new Map<string, string>();
  for (const record of result.raw) {
    const created = await prisma.rawImport.create({
      data: {
        userId: ctx.userId,
        providerAccountId,
        source,
        entityType: record.entityType,
        sourceExternalId: record.sourceExternalId,
        payload: record.payload as object,
      },
      select: { id: true },
    });
    rawIdByKey.set(rawKey(record.entityType, record.sourceExternalId), created.id);
  }

  // 2) Aktivitäten upserten.
  for (const a of result.activities) {
    const rawImportId = rawIdByKey.get(rawKey('activity', a.sourceExternalId)) ?? null;
    await prisma.activity.upsert({
      where: {
        userId_source_sourceExternalId: {
          userId: ctx.userId,
          source,
          sourceExternalId: a.sourceExternalId,
        },
      },
      create: {
        userId: ctx.userId,
        providerAccountId,
        source,
        sourceExternalId: a.sourceExternalId,
        type: a.type,
        startTime: a.startTime,
        timezone: a.timezone,
        durationSec: a.durationSec,
        distanceM: a.distanceM,
        elevationGainM: a.elevationGainM,
        avgHr: a.avgHr,
        maxHr: a.maxHr,
        avgPowerW: a.avgPowerW,
        calories: a.calories,
        rawImportId,
      },
      update: {
        type: a.type,
        startTime: a.startTime,
        timezone: a.timezone,
        durationSec: a.durationSec,
        distanceM: a.distanceM,
        elevationGainM: a.elevationGainM,
        avgHr: a.avgHr,
        maxHr: a.maxHr,
        avgPowerW: a.avgPowerW,
        calories: a.calories,
        rawImportId,
      },
    });
  }

  // 3) Tages-Gesundheitswerte upserten.
  for (const m of result.dailyHealth) {
    const date = dateOnly(m.date);
    const rawImportId = rawIdByKey.get(rawKey('health', m.date)) ?? null;
    await prisma.dailyHealthMetric.upsert({
      where: { userId_date_source: { userId: ctx.userId, date, source } },
      create: {
        userId: ctx.userId,
        providerAccountId,
        source,
        date,
        restingHr: m.restingHr,
        hrv: m.hrv,
        steps: m.steps,
        bodyBattery: m.bodyBattery,
        stressAvg: m.stressAvg,
        weightKg: m.weightKg,
        rawImportId,
      },
      update: {
        restingHr: m.restingHr,
        hrv: m.hrv,
        steps: m.steps,
        bodyBattery: m.bodyBattery,
        stressAvg: m.stressAvg,
        weightKg: m.weightKg,
        rawImportId,
      },
    });
  }

  // 4) Schlafdaten upserten.
  for (const s of result.sleep) {
    const date = dateOnly(s.date);
    const rawImportId = rawIdByKey.get(rawKey('sleep', s.date)) ?? null;
    await prisma.sleepRecord.upsert({
      where: { userId_date_source: { userId: ctx.userId, date, source } },
      create: {
        userId: ctx.userId,
        providerAccountId,
        source,
        date,
        sleepStart: s.sleepStart,
        sleepEnd: s.sleepEnd,
        totalSleepSec: s.totalSleepSec,
        deepSec: s.deepSec,
        lightSec: s.lightSec,
        remSec: s.remSec,
        awakeSec: s.awakeSec,
        sleepScore: s.sleepScore,
        rawImportId,
      },
      update: {
        sleepStart: s.sleepStart,
        sleepEnd: s.sleepEnd,
        totalSleepSec: s.totalSleepSec,
        deepSec: s.deepSec,
        lightSec: s.lightSec,
        remSec: s.remSec,
        awakeSec: s.awakeSec,
        sleepScore: s.sleepScore,
        rawImportId,
      },
    });
  }

  // 5) lastSyncAt am Provider-Account fortschreiben.
  if (providerAccountId) {
    await prisma.providerAccount
      .update({ where: { id: providerAccountId }, data: { lastSyncAt: new Date() } })
      .catch(() => undefined);
  }

  // 6) Readiness für den aktuellen Tag berechnen (deterministisch, kein LLM).
  // Optional: ein Fehler hier darf den Sync nicht scheitern lassen.
  try {
    await computeAndStoreReadiness(prisma, ctx.userId, null, logger);
  } catch (err) {
    logger?.error({ err, userId: ctx.userId }, 'Readiness-Berechnung nach Sync fehlgeschlagen');
  }

  const stats: SyncStats = {
    rawImports: result.raw.length,
    activities: result.activities.length,
    dailyHealth: result.dailyHealth.length,
    sleep: result.sleep.length,
  };
  logger?.info({ userId: ctx.userId, ...stats }, 'Garmin-Sync abgeschlossen');
  return stats;
}

/**
 * Fuehrt denselben Garmin-Sync aus, protokolliert aber den Lifecycle in `sync_jobs`.
 * Wird fuer manuelle API/Bot-Syncs und Worker-Jobs genutzt.
 */
export async function runTrackedGarminSync(
  prisma: PrismaClient,
  connector: SourceConnector,
  ctx: SyncContext & { syncJobId?: string | null },
  logger?: Logger,
): Promise<TrackedSyncResult> {
  const now = new Date();
  const syncJob = ctx.syncJobId
    ? await prisma.syncJob.update({
        where: { id: ctx.syncJobId },
        data: {
          status: 'running',
          startedAt: now,
          finishedAt: null,
          error: null,
          attempt: { increment: 1 },
        },
      })
    : await prisma.syncJob.create({
        data: {
          userId: ctx.userId,
          providerAccountId: ctx.providerAccountId,
          type: 'incremental',
          status: 'running',
          rangeFrom: ctx.since,
          rangeTo: now,
          startedAt: now,
          attempt: 1,
        },
      });

  try {
    const stats = await runGarminSync(prisma, connector, ctx, logger);
    const updated = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'success',
        finishedAt: new Date(),
        error: null,
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });
    return { stats, syncJob: updated };
  } catch (err) {
    const updated = await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error: errorMessage(err),
      },
    });
    logger?.error({ err, syncJobId: updated.id, userId: ctx.userId }, 'Garmin-Sync fehlgeschlagen');
    throw err;
  }
}
