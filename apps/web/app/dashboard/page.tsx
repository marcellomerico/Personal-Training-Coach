'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  completeGarminAuth,
  createTelegramLinkToken,
  enqueueGarminSync,
  getActivities,
  getDailyHealth,
  getGarminStatus,
  getGarminSyncJobs,
  getHealth,
  getLatestReadiness,
  getMe,
  getReadinessHistory,
  getSleep,
  logout,
  startGarminAuth,
  syncGarmin,
} from '@/lib/api';
import {
  fmtDate,
  fmtDateTime,
  fmtDistance,
  fmtDuration,
  fmtExpiresIn,
  fmtNum,
} from '@/lib/format';
import type {
  Activity,
  DailyHealthMetric,
  GarminConnectionStatus,
  ReadinessDecision,
  ReadinessMetric,
  SafeUser,
  SleepRecord,
  SyncJobSummary,
  SyncStats,
  TelegramLinkToken,
} from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<SafeUser | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [health, setHealth] = useState<DailyHealthMetric[]>([]);
  const [sleep, setSleep] = useState<SleepRecord[]>([]);
  const [readiness, setReadiness] = useState<ReadinessMetric | null>(null);
  const [readinessHistory, setReadinessHistory] = useState<ReadinessMetric[]>([]);
  const [syncJobs, setSyncJobs] = useState<SyncJobSummary[]>([]);
  const [garminStatus, setGarminStatus] = useState<GarminConnectionStatus | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [garminChallengeId, setGarminChallengeId] = useState<string | null>(null);
  const [garminMfaCode, setGarminMfaCode] = useState('000000');
  const [telegramToken, setTelegramToken] = useState<TelegramLinkToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [a, h, s, r, history, jobs, garmin] = await Promise.all([
      getActivities(10),
      getDailyHealth(7),
      getSleep(7),
      getLatestReadiness(),
      getReadinessHistory(14),
      getGarminSyncJobs(5),
      getGarminStatus(),
    ]);
    setActivities(a);
    setHealth(h);
    setSleep(s);
    setReadiness(r);
    setReadinessHistory(history);
    setSyncJobs(jobs);
    setGarminStatus(garmin);
  }, []);

  // Auth-Gate + Initialdaten.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getMe();
        if (!active) return;
        setUser(me.user);
        getHealth()
          .then(() => active && setApiOk(true))
          .catch(() => active && setApiOk(false));
        await loadData();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Unbekannter Fehler');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, loadData]);

  async function onLogout() {
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  }

  async function onConnect() {
    setError(null);
    setNotice(null);
    setConnecting(true);
    try {
      const res = await startGarminAuth({ email: user?.email ?? undefined });
      setGarminChallengeId(res.challengeId);
      setNotice(`${res.message} Danach MFA bestätigen.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Garmin-Auth konnte nicht gestartet werden');
    } finally {
      setConnecting(false);
    }
  }

  async function onCompleteGarminAuth() {
    if (!garminChallengeId) return;
    setError(null);
    setNotice(null);
    setConnecting(true);
    try {
      await completeGarminAuth({ challengeId: garminChallengeId, mfaCode: garminMfaCode });
      setGarminChallengeId(null);
      // Status sofort nachladen, damit "Garmin verbunden" auch ohne Sync erscheint.
      await loadData();
      setNotice('Garmin verbunden (Stub-MFA abgeschlossen). Jetzt Sync starten.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Garmin-MFA fehlgeschlagen');
    } finally {
      setConnecting(false);
    }
  }

  async function onLinkTelegram() {
    setError(null);
    setNotice(null);
    setLinking(true);
    try {
      const res = await createTelegramLinkToken();
      setTelegramToken(res);
      setNotice(
        res.deepLink
          ? 'Telegram-Link erzeugt – öffne ihn, um die Verknüpfung zu bestätigen.'
          : 'Token erzeugt. Für einen direkten Link muss TELEGRAM_BOT_USERNAME gesetzt sein.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Telegram-Link konnte nicht erstellt werden');
    } finally {
      setLinking(false);
    }
  }

  // Lädt /auth/me und die Daten neu – ohne kompletten Browser-Neustart.
  // Wird u. a. nach der Telegram-Verknüpfung genutzt, damit der Status
  // "Telegram verknüpft" sofort sichtbar wird.
  async function onRefresh() {
    setError(null);
    setNotice(null);
    setRefreshing(true);
    try {
      const me = await getMe();
      setUser(me.user);
      await loadData();
      setNotice(
        me.user.telegramUserId
          ? 'Status aktualisiert – Telegram ist verknüpft.'
          : 'Status aktualisiert.',
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Aktualisieren fehlgeschlagen');
    } finally {
      setRefreshing(false);
    }
  }

  async function onSync() {
    setError(null);
    setNotice(null);
    setSyncing(true);
    try {
      const res = await syncGarmin();
      const s: SyncStats = res.stats;
      setNotice(
        `Sync ok – Job ${res.syncJob.id}, Aktivitäten: ${s.activities}, Health: ${s.dailyHealth}, Schlaf: ${s.sleep}.`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  }

  // Async-Variante: reiht den Sync im Worker ein, wartet nicht auf das Ergebnis.
  // Der Job erscheint sofort als "Wartet"; Status per "Aktualisieren" verfolgen.
  async function onEnqueueSync() {
    setError(null);
    setNotice(null);
    setEnqueuing(true);
    try {
      const res = await enqueueGarminSync();
      setNotice(
        `Sync im Hintergrund eingereiht (Job ${res.syncJob.id}). Status über „Aktualisieren" verfolgen.`,
      );
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Einreihen fehlgeschlagen');
    } finally {
      setEnqueuing(false);
    }
  }

  if (loading) {
    return (
      <div className="center-screen">
        <p className="muted">Lade Dashboard …</p>
      </div>
    );
  }

  const lastActivity = activities[0] ?? null;
  const today = health[0] ?? null;
  const lastSleep = sleep[0] ?? null;
  const latestSyncJob = syncJobs[0] ?? null;
  const hasData = activities.length > 0 || health.length > 0 || sleep.length > 0;
  // Verbindungsstatus kommt direkt aus dem Provider-Account; nur als Fallback
  // (z. B. Status noch nicht geladen) auf Daten/Sync-Jobs zurückgreifen.
  const garminConnected = garminStatus
    ? garminStatus.connected
    : hasData || syncJobs.some((job) => job.status === 'success');
  const telegramConnected = user?.telegramUserId != null;

  return (
    <div className="container">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 14 }}>
          {user?.displayName || user?.email}
        </span>
        <button onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Aktualisiere …' : 'Aktualisieren'}
        </button>
        <button onClick={onLogout}>Logout</button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="stack">
        {/* Status-Übersicht (read-only) */}
        <div className="card">
          <div className="card-title">Status</div>
          <div className="status-grid">
            <StatusItem
              label="API"
              pending={apiOk == null}
              ok={apiOk === true}
              okText="erreichbar"
              badText="offline"
            />
            <StatusItem
              label="Daten"
              ok={hasData}
              okText="vorhanden"
              badText="keine"
            />
            <StatusItem
              label="Garmin"
              ok={garminConnected}
              okText="verbunden"
              badText="nicht verbunden"
            />
            <StatusItem
              label="Telegram"
              ok={telegramConnected}
              okText="verknüpft"
              badText="nicht verknüpft"
            />
          </div>
          <hr className="divider" />
          <div className="muted" style={{ fontSize: 14 }}>
            Letzter Sync:{' '}
            {latestSyncJob
              ? `${syncStatusText(latestSyncJob.status)} · ${fmtDateTime(
                  latestSyncJob.finishedAt ?? latestSyncJob.startedAt ?? latestSyncJob.createdAt,
                )}`
              : '–'}
          </div>
        </div>

        {/* Garmin-Aktionen (Stub) */}
        <div className="card">
          <div className="card-title">Garmin</div>
          <p style={{ marginTop: 0, marginBottom: 8 }}>
            <span className={`dot ${garminConnected ? 'ok' : 'bad'}`} />
            {garminConnected ? 'Verbunden' : 'Nicht verbunden'}
            {garminStatus?.authMode ? (
              <span className="muted"> · {garminStatus.authMode}</span>
            ) : null}
          </p>
          {garminStatus?.connectedAt && (
            <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
              Verbunden seit {fmtDateTime(garminStatus.connectedAt)} · Letzter Sync:{' '}
              {garminStatus.lastSyncAt ? fmtDateTime(garminStatus.lastSyncAt) : 'noch keiner'}
            </div>
          )}
          <p className="muted" style={{ marginTop: 4, marginBottom: 12 }}>
            {!garminStatus?.authMode || garminStatus.authMode.includes('stub') ? (
              <>Stub-Modus: Auth starten → MFA bestätigen (Stub-Code <code>000000</code>) → Sync.</>
            ) : (
              <>Real-Modus: Auth starten → MFA-Code von Garmin bestätigen → Sync.</>
            )}
          </p>
          <div className="row">
            <button onClick={onConnect} disabled={connecting}>
              {connecting ? 'Starte …' : '1 · Auth starten'}
            </button>
            {garminChallengeId && (
              <>
                <input
                  aria-label="Garmin MFA-Code"
                  value={garminMfaCode}
                  onChange={(event) => setGarminMfaCode(event.target.value)}
                  maxLength={12}
                  style={{ maxWidth: 140 }}
                />
                <button onClick={onCompleteGarminAuth} disabled={connecting || !garminMfaCode}>
                  2 · MFA bestätigen
                </button>
              </>
            )}
            <button className="primary" style={{ width: 'auto' }} onClick={onSync} disabled={syncing}>
              {syncing ? 'Sync läuft …' : '3 · Sync starten'}
            </button>
            <button onClick={onEnqueueSync} disabled={enqueuing}>
              {enqueuing ? 'Reihe ein …' : '3b · Sync im Hintergrund'}
            </button>
          </div>
        </div>

        {/* Telegram-Verknüpfung */}
        <TelegramCard
          connected={telegramConnected}
          telegramUserId={user?.telegramUserId ?? null}
          token={telegramToken}
          linking={linking}
          refreshing={refreshing}
          onLink={onLinkTelegram}
          onCheckLink={onRefresh}
        />

        <SyncJobsCard jobs={syncJobs} />

        {/* Readiness / Tagesbewertung */}
        <ReadinessCard readiness={readiness} />
        <ReadinessHistoryCard history={readinessHistory} />

        {/* Letzte Aktivität */}
        <div className="card">
          <div className="card-title">Letzte Aktivität</div>
          {lastActivity ? (
            <div>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>
                {lastActivity.type}
              </div>
              <div className="muted" style={{ marginBottom: 12 }}>
                {fmtDateTime(lastActivity.startTime)}
              </div>
              <div className="metrics">
                <Metric label="Dauer" value={fmtDuration(lastActivity.durationSec)} />
                <Metric label="Distanz" value={fmtDistance(lastActivity.distanceM)} />
                <Metric label="Ø HF" value={fmtNum(lastActivity.avgHr, 'bpm')} />
                <Metric label="Kalorien" value={fmtNum(lastActivity.calories, 'kcal')} />
                <Metric label="Load" value={fmtNum(lastActivity.trainingLoad)} />
              </div>
            </div>
          ) : (
            <p className="muted">Noch keine Aktivitäten. Sync starten.</p>
          )}
        </div>

        {/* Health + Schlaf */}
        <div className="grid">
          <div className="card">
            <div className="card-title">Health {today ? `· ${fmtDate(today.date)}` : ''}</div>
            {today ? (
              <div className="metrics">
                <Metric label="HRV" value={fmtNum(today.hrv, 'ms')} />
                <Metric label="Ruhepuls" value={fmtNum(today.restingHr, 'bpm')} />
                <Metric label="Body Battery" value={fmtNum(today.bodyBattery)} />
                <Metric label="Stress" value={fmtNum(today.stressAvg)} />
                <Metric label="Schritte" value={fmtNum(today.steps)} />
              </div>
            ) : (
              <p className="muted">Keine Health-Daten.</p>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Schlaf {lastSleep ? `· ${fmtDate(lastSleep.date)}` : ''}
            </div>
            {lastSleep ? (
              <div className="metrics">
                <Metric label="Dauer" value={fmtDuration(lastSleep.totalSleepSec)} />
                <Metric label="Sleep Score" value={fmtNum(lastSleep.sleepScore)} />
                <Metric label="Tief" value={fmtDuration(lastSleep.deepSec)} />
                <Metric label="REM" value={fmtDuration(lastSleep.remSec)} />
                <Metric label="Wach" value={fmtDuration(lastSleep.awakeSec)} />
              </div>
            ) : (
              <p className="muted">Keine Schlafdaten.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function StatusItem({
  label,
  ok,
  okText,
  badText,
  pending = false,
}: {
  label: string;
  ok: boolean;
  okText: string;
  badText: string;
  pending?: boolean;
}) {
  const dotClass = pending ? 'dot' : ok ? 'dot ok' : 'dot bad';
  return (
    <div className="status-item">
      <span className={dotClass} />
      <div>
        <div className="label">{label}</div>
        <div className="state">{pending ? '…' : ok ? okText : badText}</div>
      </div>
    </div>
  );
}

function TelegramCard({
  connected,
  telegramUserId,
  token,
  linking,
  refreshing,
  onLink,
  onCheckLink,
}: {
  connected: boolean;
  telegramUserId: string | null;
  token: TelegramLinkToken | null;
  linking: boolean;
  refreshing: boolean;
  onLink: () => void;
  onCheckLink: () => void;
}) {
  return (
    <div className="card">
      <div className="card-title">Telegram</div>
      {connected ? (
        <p style={{ marginTop: 0, marginBottom: 12 }}>
          <span className="dot ok" /> Verknüpft
          {telegramUserId ? <span className="muted"> · ID {telegramUserId}</span> : null}. Ein neuer
          Link verknüpft ein anderes Konto.
        </p>
      ) : (
        <p className="muted" style={{ marginTop: 0, marginBottom: 12 }}>
          Verknüpfe deinen Telegram-Account, um den Coach-Bot zu nutzen.
        </p>
      )}

      <div className="row">
        <button onClick={onLink} disabled={linking}>
          {linking ? 'Erzeuge Link …' : 'Telegram verknüpfen'}
        </button>
        {token && !connected && (
          <button onClick={onCheckLink} disabled={refreshing}>
            {refreshing ? 'Prüfe …' : 'Verknüpfung prüfen'}
          </button>
        )}
      </div>

      {token && (
        <div className="metric" style={{ marginTop: 12 }}>
          {token.deepLink ? (
            <a href={token.deepLink} target="_blank" rel="noopener noreferrer">
              In Telegram öffnen → /start
            </a>
          ) : (
            <div className="stack">
              <div className="muted" style={{ fontSize: 13 }}>
                Kein direkter Link: setze <code>TELEGRAM_BOT_USERNAME</code> in der API-Umgebung.
              </div>
              <div style={{ fontSize: 14 }}>
                Token: <code>{token.token}</code>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                Sende dem Bot manuell <code>/start {token.token}</code>.
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Gültig {fmtExpiresIn(token.expiresAt)}
          </div>
          {!connected && (
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Nach Bestätigung im Bot „Verknüpfung prüfen" klicken.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessHistoryCard({ history }: { history: ReadinessMetric[] }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Readiness-Historie</div>
        <p className="muted">Noch keine Historie vorhanden – Sync starten.</p>
      </div>
    );
  }

  const averageScore = Math.round(
    history.reduce((sum, item) => sum + item.readinessScore, 0) / history.length,
  );
  const oldestFirst = [...history].reverse();

  return (
    <div className="card">
      <div className="card-title">Readiness-Historie · {history.length} Tage</div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Metric label="Ø Score" value={`${averageScore} / 100`} />
        <Metric label="Neuester Tag" value={fmtDate(history[0]?.date ?? null)} />
      </div>
      <div className="row" style={{ alignItems: 'flex-end', gap: 6 }}>
        {oldestFirst.map((item) => (
          <div
            key={item.id}
            title={`${fmtDate(item.date)} · ${item.readinessScore}/100 · ${DECISION_LABEL[item.decision]}`}
            style={{
              width: 24,
              height: Math.max(12, item.readinessScore),
              borderRadius: 6,
              background: DECISION_COLOR[item.decision],
              opacity: 0.9,
            }}
          />
        ))}
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        {history.slice(0, 5).map((item) => (
          <div key={item.id} className="row" style={{ justifyContent: 'space-between' }}>
            <span>{fmtDate(item.date)}</span>
            <span className="muted">
              {item.readinessScore}/100 · {DECISION_LABEL[item.decision]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function syncStatusText(status: SyncJobSummary['status']): string {
  const labels: Record<SyncJobSummary['status'], string> = {
    queued: 'Wartet',
    running: 'Läuft',
    success: 'Erfolgreich',
    failed: 'Fehlgeschlagen',
  };
  return labels[status];
}

function SyncJobsCard({ jobs }: { jobs: SyncJobSummary[] }) {
  return (
    <div className="card">
      <div className="card-title">Sync-Status</div>
      {jobs.length === 0 ? (
        <p className="muted">Noch kein Sync-Job protokolliert.</p>
      ) : (
        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="metric">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{syncStatusText(job.status)}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {fmtDateTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Job {job.id} · Versuch {job.attempt}
              </div>
              {job.error && (
                <div className="error" style={{ marginTop: 8, marginBottom: 0 }}>
                  {job.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Darstellung der Entscheidung (reine UI – Logik liegt im Analysis-Engine).
const DECISION_LABEL: Record<ReadinessDecision, string> = {
  rest: 'Ruhetag',
  easy: 'Locker',
  normal: 'Normal',
  hard: 'Hart möglich',
};

const DECISION_COLOR: Record<ReadinessDecision, string> = {
  rest: '#dc2626',
  easy: '#f59e0b',
  normal: '#16a34a',
  hard: '#2563eb',
};

/** Kurze Begründung: die stärksten negativen Beiträge aus der rationale. */
function readinessSummary(readiness: ReadinessMetric): string {
  const negatives = readiness.rationale.rules
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2)
    .map((r) => r.label);
  return negatives.length > 0 ? negatives.join(' ') : 'Alle Werte im grünen Bereich.';
}

function ReadinessCard({ readiness }: { readiness: ReadinessMetric | null }) {
  if (!readiness) {
    return (
      <div className="card">
        <div className="card-title">Readiness</div>
        <p className="muted">Noch keine Bewertung berechnet – Sync starten.</p>
      </div>
    );
  }

  const color = DECISION_COLOR[readiness.decision];
  return (
    <div className="card">
      <div className="card-title">Readiness · {fmtDate(readiness.date)}</div>
      <div className="row" style={{ alignItems: 'center', gap: 20, marginBottom: 12 }}>
        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, color }}>
          {readiness.readinessScore}
          <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>
            {' '}
            / 100
          </span>
        </div>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: 999,
            background: color,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {DECISION_LABEL[readiness.decision]}
        </span>
      </div>
      <p className="muted" style={{ marginBottom: 6 }}>
        {readinessSummary(readiness)}
      </p>
      <p className="muted" style={{ fontSize: 12 }}>
        {readiness.rationale.note}
      </p>
    </div>
  );
}
