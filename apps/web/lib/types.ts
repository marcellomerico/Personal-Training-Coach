// Typen spiegeln die JSON-Antworten der NestJS-API.
// DateTime-Felder kommen als ISO-Strings über die Leitung.

export interface SafeUser {
  id: string;
  email: string;
  role: string;
  status: string;
  telegramUserId: string | null;
  displayName: string | null;
}

// Antwort von POST /auth/telegram/link-token. deepLink ist null, wenn
// TELEGRAM_BOT_USERNAME in der API nicht gesetzt ist.
export interface TelegramLinkToken {
  token: string;
  deepLink: string | null;
  expiresAt: string;
}

export interface Activity {
  id: string;
  source: string;
  type: string;
  startTime: string;
  timezone: string | null;
  durationSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPowerW: number | null;
  calories: number | null;
  trainingLoad: number | null;
}

export interface DailyHealthMetric {
  id: string;
  source: string;
  date: string;
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  bodyBattery: number | null;
  stressAvg: number | null;
  weightKg: number | null;
}

export interface SleepRecord {
  id: string;
  source: string;
  date: string;
  sleepStart: string | null;
  sleepEnd: string | null;
  totalSleepSec: number | null;
  deepSec: number | null;
  lightSec: number | null;
  remSec: number | null;
  awakeSec: number | null;
  sleepScore: number | null;
}

export interface SyncStats {
  rawImports: number;
  activities: number;
  dailyHealth: number;
  sleep: number;
}

export interface SyncJobSummary {
  id: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  type: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  stats: unknown;
  attempt: number;
  createdAt: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  time: string;
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

// Antwort von GET /providers/garmin/status (direkt aus ProviderAccount,
// unabhängig davon, ob schon Daten gesynct wurden).
export interface GarminConnectionStatus {
  connected: boolean;
  providerAccountId: string | null;
  status: string | null;
  authMode: string | null;
  externalUserId: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
}

export type ReadinessDecision = 'rest' | 'easy' | 'normal' | 'hard';

export interface ReadinessRuleContribution {
  rule: string;
  label: string;
  value: number | null;
  baseline: number | null;
  delta: number;
}

export interface ReadinessRationale {
  baseScore: number;
  finalScore: number;
  rules: ReadinessRuleContribution[];
  note: string;
}

export interface ReadinessMetric {
  id: string;
  date: string;
  readinessScore: number;
  hrvVsBaseline: number | null;
  rhrVsBaseline: number | null;
  sleepFactor: number | null;
  loadSignal: number | null;
  decision: ReadinessDecision;
  rationale: ReadinessRationale;
  computedAt: string;
  engineVersion: string;
}

// Deterministische Coach-Empfehlung (GET /coach/recommendation).
// explanationText bleibt null, bis das LLM (optional) aktiviert wird.
export interface CoachRecommendation {
  date: string;
  decision: ReadinessDecision;
  readinessScore: number;
  headline: string;
  guidance: string[];
  reasons: string[];
  explanationText: string | null;
  engineVersion: string;
}
