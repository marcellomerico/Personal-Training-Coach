import type { UserId } from './user';

/**
 * Unterstützte Datenquellen. Garmin ist primär; offizieller und inoffizieller
 * Garmin-Zugang sind bewusst getrennte Provider hinter demselben Interface.
 */
export type Provider = 'garmin_unofficial' | 'garmin_official' | 'strava';

export type ProviderAccountStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface ProviderAccount {
  id: string;
  userId: UserId;
  provider: Provider;
  externalUserId: string | null;
  status: ProviderAccountStatus;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  /**
   * Tokens/Secrets werden ausschließlich verschlüsselt at rest gespeichert
   * und NIE an Clients ausgeliefert. Hier nur als opaker, bereits verschlüsselter Blob.
   */
  encryptedSecrets: string | null;
}

/** Rohdaten, wie sie der Provider liefert (unverändert, für Audit/Reprocessing). */
export interface RawRecord {
  provider: Provider;
  entityType: 'activity' | 'health' | 'sleep';
  sourceExternalId: string;
  fetchedAt: Date;
  payload: unknown;
}

export type ActivityType = 'run' | 'ride' | 'swim' | 'strength' | 'walk' | 'other';

/** Normalisierte Aktivität – Analyse/UI arbeiten ausschließlich hierauf. */
export interface NormalizedActivity {
  source: Provider;
  sourceExternalId: string;
  type: ActivityType;
  startTime: Date;
  timezone: string | null;
  durationSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPowerW: number | null;
  calories: number | null;
}

/** Normalisierte tägliche Gesundheitsmetrik (provider-übergreifend). */
export interface NormalizedDailyHealth {
  source: Provider;
  date: string; // ISO-Datum (YYYY-MM-DD)
  restingHr: number | null;
  hrv: number | null;
  steps: number | null;
  bodyBattery: number | null;
  stressAvg: number | null;
  weightKg: number | null;
}

/** Normalisierte Schlafnacht (Phasen-Granularität provider-abhängig). */
export interface NormalizedSleep {
  source: Provider;
  date: string; // ISO-Datum (YYYY-MM-DD) der Aufwachnacht
  sleepStart: Date | null;
  sleepEnd: Date | null;
  totalSleepSec: number | null;
  deepSec: number | null;
  lightSec: number | null;
  remSec: number | null;
  awakeSec: number | null;
  sleepScore: number | null;
}

export interface SyncResult {
  activities: NormalizedActivity[];
  dailyHealth: NormalizedDailyHealth[];
  sleep: NormalizedSleep[];
  raw: RawRecord[];
}

/**
 * Einheitliches Interface für alle Lese-Connectors (Garmin/Strava/...).
 * Jede neue Quelle implementiert dieses Interface, ohne dass Analyse/UI sich ändern.
 */
export interface SourceConnector {
  readonly provider: Provider;
  /** Daten seit `since` abrufen und normalisiert zurückgeben. */
  fetchSince(account: ProviderAccount, since: Date | null): Promise<SyncResult>;
}

/**
 * Schmaler Export-/Write-back-Pfad (S3). Bewusst getrennt vom Lesen.
 * Garmin-Write-back ist ausgeschlossen (siehe Risiko R-T11 in docs/open-questions.md).
 */
export interface WorkoutExporter {
  readonly target: 'file' | 'intervals_icu';
}
