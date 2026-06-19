import type {
  ActivityType,
  NormalizedActivity,
  NormalizedDailyHealth,
  NormalizedSleep,
  Provider,
  ProviderAccount,
  RawRecord,
  SourceConnector,
  SyncResult,
} from '@ptc/core';
import {
  activitiesResponseSchema,
  garminAuthCompleteResponseSchema,
  garminAuthStartResponseSchema,
  healthResponseSchema,
  sleepResponseSchema,
  type ActivityPayload,
  type DailyHealthPayload,
  type GarminAuthCompleteResponse,
  type GarminAuthStartResponse,
  type SleepPayload,
} from './schemas';

export interface GarminConnectorOptions {
  /** Basis-URL des Python-Connectors, z. B. http://localhost:8000 */
  baseUrl: string;
  /** Optionaler interner Shared-Secret-Header (x-internal-key). */
  apiKey?: string;
  /** Standard-Rückblick in Tagen, wenn kein `since` übergeben wird. */
  defaultLookbackDays?: number;
  /**
   * Entschlüsselte Provider-Session (aus `provider_accounts.secrets`).
   * Wird bei Datenabrufen als `x-garmin-session`-Header an den Python-Connector
   * gesendet, damit der echte Datenabruf zustandslos und prozessunabhängig
   * funktioniert. Im Stub-Modus ignoriert der Connector den Header.
   */
  session?: Record<string, unknown>;
}

export interface GarminAuthStartInput {
  email?: string;
  password?: string;
}

export interface GarminAuthCompleteInput {
  challengeId: string;
  mfaCode: string;
}

const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = {
  run: 'run',
  running: 'run',
  ride: 'ride',
  cycling: 'ride',
  biking: 'ride',
  swim: 'swim',
  swimming: 'swim',
  strength: 'strength',
  strength_training: 'strength',
  walk: 'walk',
  walking: 'walk',
};

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapActivityType(raw: string): ActivityType {
  return ACTIVITY_TYPE_MAP[raw.toLowerCase()] ?? 'other';
}

function extractConnectorErrorDetail(body: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
  } catch {
    // Nicht-JSON-Antworten unverändert durchreichen.
  }
  return body;
}

/**
 * TS-Client zum isolierten Python-Garmin-Connector. Implementiert das
 * gemeinsame {@link SourceConnector}-Interface; Analyse/UI bleiben provider-agnostisch.
 * Tauscht man später auf die offizielle Garmin-API, bleibt dieses Interface gleich.
 */
export class GarminConnector implements SourceConnector {
  readonly provider: Provider;

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultLookbackDays: number;
  private readonly session?: Record<string, unknown>;

  constructor(opts: GarminConnectorOptions, provider: Provider = 'garmin_unofficial') {
    this.provider = provider;
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.defaultLookbackDays = opts.defaultLookbackDays ?? 30;
    this.session = opts.session;
  }

  async fetchSince(account: ProviderAccount, since: Date | null): Promise<SyncResult> {
    const to = new Date();
    const from =
      since ?? new Date(to.getTime() - this.defaultLookbackDays * 24 * 60 * 60 * 1000);
    const seed = account.externalUserId ?? account.userId;
    const range = { from: toDateOnly(from), to: toDateOnly(to), seed };

    const [activitiesRes, healthRes, sleepRes] = await Promise.all([
      this.get('/activities', range, activitiesResponseSchema),
      this.get('/daily-health', range, healthResponseSchema),
      this.get('/sleep', range, sleepResponseSchema),
    ]);

    const raw: RawRecord[] = [];
    const fetchedAt = new Date();

    const activities = activitiesRes.activities.map((a) => {
      raw.push({
        provider: this.provider,
        entityType: 'activity',
        sourceExternalId: a.sourceExternalId,
        fetchedAt,
        payload: a,
      });
      return this.normalizeActivity(a);
    });

    const dailyHealth = healthRes.metrics.map((m) => {
      raw.push({
        provider: this.provider,
        entityType: 'health',
        sourceExternalId: m.date,
        fetchedAt,
        payload: m,
      });
      return this.normalizeHealth(m);
    });

    const sleep = sleepRes.sleep.map((s) => {
      raw.push({
        provider: this.provider,
        entityType: 'sleep',
        sourceExternalId: s.date,
        fetchedAt,
        payload: s,
      });
      return this.normalizeSleep(s);
    });

    return { activities, dailyHealth, sleep, raw };
  }

  async startAuth(input: GarminAuthStartInput): Promise<GarminAuthStartResponse> {
    return this.post('/auth/start', input, garminAuthStartResponseSchema);
  }

  async completeAuth(input: GarminAuthCompleteInput): Promise<GarminAuthCompleteResponse> {
    return this.post('/auth/complete', input, garminAuthCompleteResponseSchema);
  }

  private normalizeActivity(a: ActivityPayload): NormalizedActivity {
    return {
      source: this.provider,
      sourceExternalId: a.sourceExternalId,
      type: mapActivityType(a.type),
      startTime: new Date(a.startTime),
      timezone: a.timezone ?? null,
      durationSec: a.durationSec,
      distanceM: a.distanceM ?? null,
      elevationGainM: a.elevationGainM ?? null,
      avgHr: a.avgHr ?? null,
      maxHr: a.maxHr ?? null,
      avgPowerW: a.avgPowerW ?? null,
      calories: a.calories ?? null,
    };
  }

  private normalizeHealth(m: DailyHealthPayload): NormalizedDailyHealth {
    return {
      source: this.provider,
      date: m.date,
      restingHr: m.restingHr ?? null,
      hrv: m.hrv ?? null,
      steps: m.steps ?? null,
      bodyBattery: m.bodyBattery ?? null,
      stressAvg: m.stressAvg ?? null,
      weightKg: m.weightKg ?? null,
    };
  }

  private normalizeSleep(s: SleepPayload): NormalizedSleep {
    return {
      source: this.provider,
      date: s.date,
      sleepStart: s.sleepStart ? new Date(s.sleepStart) : null,
      sleepEnd: s.sleepEnd ? new Date(s.sleepEnd) : null,
      totalSleepSec: s.totalSleepSec ?? null,
      deepSec: s.deepSec ?? null,
      lightSec: s.lightSec ?? null,
      remSec: s.remSec ?? null,
      awakeSec: s.awakeSec ?? null,
      sleepScore: s.sleepScore ?? null,
    };
  }

  private async get<T>(
    path: string,
    params: Record<string, string>,
    schema: { parse: (v: unknown) => T },
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) headers['x-internal-key'] = this.apiKey;
    // Session nur bei Datenabrufen (get) mitsenden; Stub ignoriert sie.
    if (this.session) headers['x-garmin-session'] = JSON.stringify(this.session);

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const detail = extractConnectorErrorDetail(body);
      if (res.status === 401) {
        throw new Error(
          `Garmin-Session abgelaufen oder ungültig. Bitte erneut mit Garmin verbinden. ${detail}`.trim(),
        );
      }
      throw new Error(
        `Garmin-Connector ${path} fehlgeschlagen: HTTP ${res.status} ${detail}`.trim(),
      );
    }
    const json: unknown = await res.json();
    return schema.parse(json);
  }

  private async post<T>(
    path: string,
    body: unknown,
    schema: { parse: (v: unknown) => T },
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (this.apiKey) headers['x-internal-key'] = this.apiKey;

    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Garmin-Connector ${path} fehlgeschlagen: HTTP ${res.status} ${text}`.trim(),
      );
    }
    const json: unknown = await res.json();
    return schema.parse(json);
  }
}
