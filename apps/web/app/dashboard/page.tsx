'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  completeGarminAuth,
  getActivities,
  getDailyHealth,
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
import { fmtDate, fmtDateTime, fmtDistance, fmtDuration, fmtNum } from '@/lib/format';
import type {
  Activity,
  DailyHealthMetric,
  ReadinessDecision,
  ReadinessMetric,
  SafeUser,
  SleepRecord,
  SyncJobSummary,
  SyncStats,
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

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [garminChallengeId, setGarminChallengeId] = useState<string | null>(null);
  const [garminMfaCode, setGarminMfaCode] = useState('000000');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadData = useCallback(async () => {
    const [a, h, s, r, history, jobs] = await Promise.all([
      getActivities(10),
      getDailyHealth(7),
      getSleep(7),
      getLatestReadiness(),
      getReadinessHistory(14),
      getGarminSyncJobs(5),
    ]);
    setActivities(a);
    setHealth(h);
    setSleep(s);
    setReadiness(r);
    setReadinessHistory(history);
    setSyncJobs(jobs);
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
      setNotice('Garmin verbunden (Stub-MFA abgeschlossen). Jetzt Sync starten.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Garmin-MFA fehlgeschlagen');
    } finally {
      setConnecting(false);
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

  return (
    <div className="container">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 14 }}>
          {user?.displayName || user?.email}
        </span>
        <button onClick={onLogout}>Logout</button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="stack">
        {/* Status + Aktionen */}
        <div className="card">
          <div className="card-title">Status</div>
          <div className="row" style={{ marginBottom: 14 }}>
            <span>
              <span className={`dot ${apiOk ? 'ok' : 'bad'}`} />
              API {apiOk == null ? '…' : apiOk ? 'erreichbar' : 'offline'}
            </span>
            <span>
              <span className={`dot ${hasData ? 'ok' : 'bad'}`} />
              {hasData ? 'Daten vorhanden' : 'Keine Daten'}
            </span>
            <span className="muted">
              Letzter Sync:{' '}
              {latestSyncJob?.finishedAt
                ? `${syncStatusText(latestSyncJob.status)} · ${fmtDateTime(latestSyncJob.finishedAt)}`
                : '–'}
            </span>
          </div>
          <div className="row">
            <button onClick={onConnect} disabled={connecting}>
              {connecting ? 'Starte …' : 'Garmin Auth starten'}
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
                  MFA bestätigen
                </button>
              </>
            )}
            <button className="primary" style={{ width: 'auto' }} onClick={onSync} disabled={syncing}>
              {syncing ? 'Sync läuft …' : 'Garmin Sync starten'}
            </button>
          </div>
        </div>

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
