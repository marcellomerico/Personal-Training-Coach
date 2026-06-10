// Kleine Formatierungs-Helfer für die Anzeige.

export function fmtDate(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Sekunden -> "1h 23m" bzw. "45m". */
export function fmtDuration(sec: number | null): string {
  if (sec == null) return '–';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Meter -> "12,3 km" bzw. "850 m". */
export function fmtDistance(m: number | null): string {
  if (m == null) return '–';
  if (m >= 1000) return `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`;
  return `${Math.round(m)} m`;
}

/** Verständliche Ablaufanzeige: "noch 14 Min. (15:23 Uhr)" bzw. "abgelaufen". */
export function fmtExpiresIn(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return `abgelaufen (${time} Uhr)`;
  const mins = Math.max(1, Math.round(diffMs / 60000));
  return `noch ${mins} Min. (${time} Uhr)`;
}

export function fmtNum(v: number | null, unit = ''): string {
  if (v == null) return '–';
  const s = v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return unit ? `${s} ${unit}` : s;
}
