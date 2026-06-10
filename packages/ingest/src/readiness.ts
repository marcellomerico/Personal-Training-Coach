import type { Logger } from '@ptc/config';
import {
  computeReadiness,
  type ReadinessActivityInput,
  type ReadinessHealthInput,
  type ReadinessInput,
  type ReadinessResult,
} from '@ptc/analysis';
import { type Prisma, type PrismaClient } from '@ptc/db';

/** Tage Aktivitäts-Rückblick (für „harte Einheit am Vortag“). */
const ACTIVITY_LOOKBACK_DAYS = 14;
/** Tage Health-Rückblick (für Baseline-Ableitung ohne Profilwerte). */
const HEALTH_LOOKBACK_DAYS = 21;
/** Standardfenster fuer Readiness-Historie nach einem Sync. */
export const DEFAULT_READINESS_HISTORY_DAYS = 14;

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBefore(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function daysAfter(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function historyDatesEndingAt(endDate: string, days: number): string[] {
  const end = dateOnly(endDate);
  const count = Math.max(1, days);
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (count - 1 - index));
    return isoDate(d);
  });
}

/**
 * Bestimmt den Zieltag der Bewertung: explizit übergeben, sonst der jüngste
 * vorhandene Health-Tag, sonst der jüngste Schlaf-Tag. `null`, wenn keine Daten.
 */
async function resolveTargetDate(
  prisma: PrismaClient,
  userId: string,
  explicit?: string | null,
): Promise<string | null> {
  if (explicit) return explicit;

  const latestHealth = await prisma.dailyHealthMetric.findFirst({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  if (latestHealth) return isoDate(latestHealth.date);

  const latestSleep = await prisma.sleepRecord.findFirst({
    where: { userId },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  if (latestSleep) return isoDate(latestSleep.date);

  return null;
}

/**
 * Lädt die für den Zieltag nötigen Daten, berechnet die Readiness über das
 * (framework-freie) {@link computeReadiness} und schreibt das Ergebnis
 * idempotent (Upsert auf userId+date). Wird von der API (recompute) UND am Ende
 * von {@link runGarminSync} genutzt – Single Source of Truth, keine doppelte Logik.
 *
 * Liefert `null`, wenn für den Nutzer keinerlei Daten vorliegen.
 */
export async function computeAndStoreReadiness(
  prisma: PrismaClient,
  userId: string,
  date?: string | null,
  logger?: Logger,
): Promise<ReadinessResult | null> {
  const targetDate = await resolveTargetDate(prisma, userId, date);
  if (!targetDate) {
    logger?.info({ userId }, 'Readiness übersprungen – keine Daten vorhanden');
    return null;
  }

  const target = dateOnly(targetDate);

  const [healthRow, sleepRow, activityRows, recentHealthRows, profile] = await Promise.all([
    prisma.dailyHealthMetric.findFirst({ where: { userId, date: target } }),
    prisma.sleepRecord.findFirst({ where: { userId, date: target } }),
    prisma.activity.findMany({
      where: {
        userId,
        startTime: {
          gte: daysBefore(target, ACTIVITY_LOOKBACK_DAYS),
          lt: daysAfter(target, 1),
        },
      },
      orderBy: { startTime: 'desc' },
    }),
    prisma.dailyHealthMetric.findMany({
      where: {
        userId,
        date: {
          gte: daysBefore(target, HEALTH_LOOKBACK_DAYS),
          lte: target,
        },
      },
      orderBy: { date: 'desc' },
    }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);

  const health: ReadinessHealthInput | null = healthRow
    ? { date: isoDate(healthRow.date), restingHr: healthRow.restingHr, hrv: healthRow.hrv }
    : null;

  const recentActivities: ReadinessActivityInput[] = activityRows.map((a) => ({
    startTime: a.startTime.toISOString(),
    type: a.type,
    durationSec: a.durationSec,
    avgHr: a.avgHr,
    trainingLoad: a.trainingLoad,
  }));

  const recentHealth: ReadinessHealthInput[] = recentHealthRows.map((h) => ({
    date: isoDate(h.date),
    restingHr: h.restingHr,
    hrv: h.hrv,
  }));

  const input: ReadinessInput = {
    date: targetDate,
    health,
    sleep: sleepRow
      ? {
          date: isoDate(sleepRow.date),
          sleepScore: sleepRow.sleepScore,
          totalSleepSec: sleepRow.totalSleepSec,
        }
      : null,
    recentActivities,
    recentHealth,
    baselines: profile
      ? { hrvBaseline: profile.hrvBaseline, restingHrBaseline: profile.restingHrBaseline }
      : undefined,
  };

  const result = computeReadiness(input);

  await prisma.readinessMetric.upsert({
    where: { userId_date: { userId, date: target } },
    create: {
      userId,
      date: target,
      readinessScore: result.readinessScore,
      hrvVsBaseline: result.hrvVsBaseline,
      rhrVsBaseline: result.rhrVsBaseline,
      sleepFactor: result.sleepFactor,
      loadSignal: result.loadSignal,
      decision: result.decision,
      rationale: result.rationale as unknown as Prisma.InputJsonValue,
      engineVersion: result.engineVersion,
    },
    update: {
      readinessScore: result.readinessScore,
      hrvVsBaseline: result.hrvVsBaseline,
      rhrVsBaseline: result.rhrVsBaseline,
      sleepFactor: result.sleepFactor,
      loadSignal: result.loadSignal,
      decision: result.decision,
      rationale: result.rationale as unknown as Prisma.InputJsonValue,
      engineVersion: result.engineVersion,
      computedAt: new Date(),
    },
  });

  logger?.info(
    { userId, date: targetDate, score: result.readinessScore, decision: result.decision },
    'Readiness berechnet',
  );
  return result;
}

/**
 * Berechnet eine rollierende Readiness-Historie bis zum juengsten Datentag.
 * Damit wird nach einem Backfill/Sync nicht nur der aktuelle Tag sichtbar.
 */
export async function computeAndStoreReadinessHistory(
  prisma: PrismaClient,
  userId: string,
  days = DEFAULT_READINESS_HISTORY_DAYS,
  logger?: Logger,
): Promise<ReadinessResult[]> {
  const latestDate = await resolveTargetDate(prisma, userId, null);
  if (!latestDate) {
    logger?.info({ userId }, 'Readiness-Historie übersprungen – keine Daten vorhanden');
    return [];
  }

  const results: ReadinessResult[] = [];
  for (const date of historyDatesEndingAt(latestDate, days)) {
    const result = await computeAndStoreReadiness(prisma, userId, date, logger);
    if (result) results.push(result);
  }
  return results;
}
