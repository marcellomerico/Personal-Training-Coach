'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  connectGarmin,
  getActivities,
  getDailyHealth,
  getHealth,
  getMe,
  getSleep,
  logout,
  syncGarmin,
} from '@/lib/api';
import { fmtDate, fmtDateTime, fmtDistance, fmtDuration, fmtNum } from '@/lib/format';
import type {
  Activity,
  DailyHealthMetric,
  SafeUser,
  SleepRecord,
  SyncStats,
} from '@/lib/types';

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<SafeUser | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [health, setHealth] = useState<DailyHealthMetric[]>([]);
  const [sleep, setSleep] = useState<SleepRecord[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const loadData = useCallback(async () => {
    const [a, h, s] = await Promise.all([
      getActivities(10),
      getDailyHealth(7),
      getSleep(7),
    ]);
    setActivities(a);
    setHealth(h);
    setSleep(s);
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
      await connectGarmin();
      setNotice('Garmin verbunden (Stub). Jetzt Sync starten.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verbinden fehlgeschlagen');
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
        `Sync ok – Aktivitäten: ${s.activities}, Health: ${s.dailyHealth}, Schlaf: ${s.sleep}.`,
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
              Letzter Sync: {lastActivity ? fmtDateTime(lastActivity.startTime) : '–'}
            </span>
          </div>
          <div className="row">
            <button onClick={onConnect} disabled={connecting}>
              {connecting ? 'Verbinde …' : 'Garmin verbinden'}
            </button>
            <button className="primary" style={{ width: 'auto' }} onClick={onSync} disabled={syncing}>
              {syncing ? 'Sync läuft …' : 'Garmin Sync starten'}
            </button>
          </div>
        </div>

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
