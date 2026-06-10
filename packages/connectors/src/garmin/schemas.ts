import { z } from 'zod';

/**
 * Validierung der Antworten des Python-Garmin-Connectors. Die Felder sind bereits
 * vom Connector vor-normalisiert (camelCase), werden hier aber strikt geprüft,
 * bevor sie ins Kernsystem gelangen.
 */

export const activitySchema = z.object({
  sourceExternalId: z.string(),
  type: z.string(),
  startTime: z.string(), // ISO 8601
  timezone: z.string().nullable().optional(),
  durationSec: z.number().int().nonnegative(),
  distanceM: z.number().nullable().optional(),
  elevationGainM: z.number().nullable().optional(),
  avgHr: z.number().int().nullable().optional(),
  maxHr: z.number().int().nullable().optional(),
  avgPowerW: z.number().int().nullable().optional(),
  calories: z.number().int().nullable().optional(),
});

export const dailyHealthSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  restingHr: z.number().int().nullable().optional(),
  hrv: z.number().nullable().optional(),
  steps: z.number().int().nullable().optional(),
  bodyBattery: z.number().int().nullable().optional(),
  stressAvg: z.number().int().nullable().optional(),
  weightKg: z.number().nullable().optional(),
});

export const sleepSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  sleepStart: z.string().nullable().optional(),
  sleepEnd: z.string().nullable().optional(),
  totalSleepSec: z.number().int().nullable().optional(),
  deepSec: z.number().int().nullable().optional(),
  lightSec: z.number().int().nullable().optional(),
  remSec: z.number().int().nullable().optional(),
  awakeSec: z.number().int().nullable().optional(),
  sleepScore: z.number().int().nullable().optional(),
});

export const activitiesResponseSchema = z.object({ activities: z.array(activitySchema) });
export const healthResponseSchema = z.object({ metrics: z.array(dailyHealthSchema) });
export const sleepResponseSchema = z.object({ sleep: z.array(sleepSchema) });

export const garminAuthStartResponseSchema = z.object({
  mode: z.literal('stub'),
  mfaRequired: z.boolean(),
  challengeId: z.string(),
  expiresAt: z.string(),
  message: z.string(),
});

export const garminAuthCompleteResponseSchema = z.object({
  externalUserId: z.string(),
  displayName: z.string().nullable().optional(),
  connectedAt: z.string(),
  secrets: z.record(z.unknown()),
});

export type ActivityPayload = z.infer<typeof activitySchema>;
export type DailyHealthPayload = z.infer<typeof dailyHealthSchema>;
export type SleepPayload = z.infer<typeof sleepSchema>;
export type GarminAuthStartResponse = z.infer<typeof garminAuthStartResponseSchema>;
export type GarminAuthCompleteResponse = z.infer<typeof garminAuthCompleteResponseSchema>;
