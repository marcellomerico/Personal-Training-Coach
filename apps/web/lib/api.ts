import type {
  Activity,
  DailyHealthMetric,
  GarminAuthCompleteResult,
  GarminAuthStartResult,
  HealthStatus,
  ReadinessMetric,
  SafeUser,
  GarminConnectionStatus,
  SleepRecord,
  SyncJobSummary,
  SyncStats,
  TelegramLinkToken,
} from './types';

// Basis-URL der NestJS-API. Im Dev läuft sie auf Port 3001; die API erlaubt
// CORS für WEB_ORIGIN (Default http://localhost:3000) mit credentials.
const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      // Cookie-basierte Session -> Cookies immer mitsenden.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError('API nicht erreichbar. Läuft `pnpm dev:all`?', 0);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(extractMessage(data, res.status), res.status);
  }
  return data as T;
}

function extractMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const msg = (data as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
  }
  return `Fehler ${status}`;
}

// --- Auth ------------------------------------------------------------------

export function getMe(): Promise<{ user: SafeUser }> {
  return request('/auth/me');
}

export function register(body: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ user: SafeUser }> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export function login(body: {
  email: string;
  password: string;
}): Promise<{ user: SafeUser }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export function logout(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

/** Erzeugt einen Einmal-Token (+ Deep-Link) zur Telegram-Verknüpfung. */
export function createTelegramLinkToken(): Promise<TelegramLinkToken> {
  return request('/auth/telegram/link-token', { method: 'POST' });
}

// --- Status ----------------------------------------------------------------

export function getHealth(): Promise<HealthStatus> {
  return request('/health');
}

// --- Garmin ----------------------------------------------------------------

export function connectGarmin(): Promise<{ providerAccountId: string; status: string }> {
  return request('/providers/garmin/connect', { method: 'POST' });
}

/** Verbindungsstatus des Garmin-Accounts (unabhängig von gesyncten Daten). */
export function getGarminStatus(): Promise<GarminConnectionStatus> {
  return request('/providers/garmin/status');
}

export function startGarminAuth(body: { email?: string }): Promise<GarminAuthStartResult> {
  return request('/providers/garmin/auth/start', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function completeGarminAuth(body: {
  challengeId: string;
  mfaCode: string;
}): Promise<GarminAuthCompleteResult> {
  return request('/providers/garmin/auth/complete', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function syncGarmin(): Promise<{ ok: boolean; stats: SyncStats; syncJob: SyncJobSummary }> {
  return request('/sync/garmin', { method: 'POST', body: JSON.stringify({}) });
}

export function getGarminSyncJobs(limit = 5): Promise<SyncJobSummary[]> {
  return request(`/sync/garmin/jobs?limit=${limit}`);
}

export function getActivities(limit = 10): Promise<Activity[]> {
  return request(`/activities?limit=${limit}`);
}

export function getDailyHealth(limit = 7): Promise<DailyHealthMetric[]> {
  return request(`/daily-health?limit=${limit}`);
}

export function getSleep(limit = 7): Promise<SleepRecord[]> {
  return request(`/sleep?limit=${limit}`);
}

// --- Readiness -------------------------------------------------------------

/** Zuletzt berechnete Tagesbewertung (oder null, wenn noch keine vorhanden). */
export function getLatestReadiness(): Promise<ReadinessMetric | null> {
  return request('/readiness/latest');
}

/** Letzte Tagesbewertungen, neueste zuerst. */
export function getReadinessHistory(limit = 14): Promise<ReadinessMetric[]> {
  return request(`/readiness/history?limit=${limit}`);
}
