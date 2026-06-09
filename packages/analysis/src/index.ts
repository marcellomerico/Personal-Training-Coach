/**
 * @ptc/analysis – deterministisches Readiness-Engine (Phase 5, v0).
 *
 * Framework-frei und ohne Runtime-Dependencies: nimmt bereits geladene,
 * normalisierte Eingaben entgegen und berechnet REGELBASIERT (kein LLM) eine
 * Tagesbewertung mit nachvollziehbarer `rationale`.
 *
 * WICHTIG: Das ist eine grobe v0-Heuristik und KEIN medizinischer Rat.
 * Die Regeln und Schwellwerte sind bewusst einfach gehalten und werden später
 * verfeinert (Baselines, Trends, Trainingslast). Siehe README.
 */

export const READINESS_ENGINE_VERSION = 'readiness-v0.1.0';

/** Empfohlene Trainingsintensität für den Tag. */
export type ReadinessDecision = 'rest' | 'easy' | 'normal' | 'hard';

// --- Eingabe-Typen (provider-agnostisch, plain) ----------------------------

export interface ReadinessHealthInput {
  date: string; // YYYY-MM-DD
  restingHr: number | null;
  hrv: number | null;
}

export interface ReadinessSleepInput {
  date: string; // YYYY-MM-DD
  sleepScore: number | null;
  totalSleepSec: number | null;
}

export interface ReadinessActivityInput {
  startTime: string; // ISO 8601
  type: string;
  durationSec: number;
  avgHr: number | null;
  trainingLoad: number | null;
}

export interface ReadinessBaselines {
  hrvBaseline: number | null;
  restingHrBaseline: number | null;
}

export interface ReadinessInput {
  /** Zieltag (YYYY-MM-DD), für den die Bewertung gilt. */
  date: string;
  /** Gesundheitswerte des Zieltags (null = keine Daten). */
  health: ReadinessHealthInput | null;
  /** Schlafdaten des Zieltags (null = keine Daten). */
  sleep: ReadinessSleepInput | null;
  /** Letzte Aktivitäten (zur Erkennung harter Einheiten am Vortag). */
  recentActivities: ReadinessActivityInput[];
  /** Zurückliegende Health-Tage (für Baseline-Ableitung, falls kein Profil). */
  recentHealth: ReadinessHealthInput[];
  /** Optionale Baselines aus dem User-Profil. */
  baselines?: ReadinessBaselines;
}

// --- Ausgabe-Typen ----------------------------------------------------------

/** Ein einzelner Regel-Beitrag zum Score (Explainability). */
export interface ReadinessRuleContribution {
  rule: 'sleep' | 'hrv' | 'rhr' | 'load';
  label: string; // kurze deutsche Begründung
  value: number | null; // beobachteter Wert
  baseline: number | null; // Vergleichswert (falls vorhanden)
  delta: number; // Punkte-Beitrag (<= 0)
}

/** Strukturierte Begründung: rohe Inputs + Regel-Beiträge. */
export interface ReadinessRationale {
  baseScore: number;
  finalScore: number;
  inputs: {
    date: string;
    restingHr: number | null;
    hrv: number | null;
    sleepScore: number | null;
    totalSleepSec: number | null;
    hrvBaseline: number | null;
    restingHrBaseline: number | null;
    lastActivity: {
      type: string;
      startTime: string;
      durationSec: number;
      avgHr: number | null;
    } | null;
  };
  rules: ReadinessRuleContribution[];
  /** Disclaimer – kein medizinischer Rat. */
  note: string;
}

export interface ReadinessResult {
  date: string;
  readinessScore: number; // 0–100
  hrvVsBaseline: number | null; // Verhältnis hrv/baseline
  rhrVsBaseline: number | null; // Verhältnis rhr/baseline
  sleepFactor: number | null; // 0–1
  loadSignal: number | null; // 0–1
  decision: ReadinessDecision;
  rationale: ReadinessRationale;
  engineVersion: string;
}

const BASE_SCORE = 100;
const DISCLAIMER =
  'Heuristische v0-Bewertung – kein medizinischer Rat. Im Zweifel auf den Körper hören.';

// --- Hilfsfunktionen --------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Mittelwert über vorhandene (nicht-null) Zahlen; null wenn keine vorhanden. */
function average(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, v) => sum + v, 0) / nums.length;
}

/** YYYY-MM-DD des Vortags (UTC, stabil unabhängig von Zeitzone). */
function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// --- Engine -----------------------------------------------------------------

/**
 * Berechnet die Tages-Readiness aus den übergebenen Daten.
 *
 * Vorgehen: Start bei {@link BASE_SCORE} (100) und Abzüge je Regel:
 * - schlechter Schlaf senkt den Score
 * - HRV unter Baseline senkt den Score
 * - erhöhter Ruhepuls senkt den Score
 * - harte Aktivität am Vortag senkt den Score leicht
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { date, health, sleep, recentActivities } = input;

  // Baselines: Profil bevorzugt, sonst Mittelwert der zurückliegenden Tage
  // (Zieltag ausgeschlossen, um das Signal nicht zu verwässern), sonst Default.
  const priorHealth = input.recentHealth.filter((h) => h.date < date);
  const hrvBaseline =
    input.baselines?.hrvBaseline ?? average(priorHealth.map((h) => h.hrv)) ?? 60;
  const rhrBaseline =
    input.baselines?.restingHrBaseline ?? average(priorHealth.map((h) => h.restingHr)) ?? 55;

  const rules: ReadinessRuleContribution[] = [];

  // Regel 1: Schlaf. Sleep-Score bevorzugt; sonst aus Dauer (8 h ≈ 100).
  const sleepScore = sleep?.sleepScore ?? null;
  const sleepFromDuration =
    sleep?.totalSleepSec != null ? Math.round((sleep.totalSleepSec / (8 * 3600)) * 100) : null;
  const effectiveSleep = sleepScore ?? sleepFromDuration;
  let sleepDelta = 0;
  let sleepLabel = 'Keine Schlafdaten – neutral bewertet.';
  if (effectiveSleep != null) {
    if (effectiveSleep < 50) {
      sleepDelta = -30;
      sleepLabel = 'Sehr schlechter Schlaf.';
    } else if (effectiveSleep < 65) {
      sleepDelta = -18;
      sleepLabel = 'Schlechter Schlaf.';
    } else if (effectiveSleep < 80) {
      sleepDelta = -8;
      sleepLabel = 'Mäßiger Schlaf.';
    } else {
      sleepLabel = 'Guter Schlaf.';
    }
  }
  rules.push({
    rule: 'sleep',
    label: sleepLabel,
    value: effectiveSleep,
    baseline: 80,
    delta: sleepDelta,
  });
  const sleepFactor = effectiveSleep != null ? round2(clamp(effectiveSleep / 100, 0, 1)) : null;

  // Regel 2: HRV vs. Baseline (niedriger = weniger erholt).
  const hrv = health?.hrv ?? null;
  let hrvDelta = 0;
  let hrvVsBaseline: number | null = null;
  let hrvLabel = 'Keine HRV-Daten – neutral bewertet.';
  if (hrv != null && hrvBaseline > 0) {
    hrvVsBaseline = round2(hrv / hrvBaseline);
    if (hrvVsBaseline < 0.8) {
      hrvDelta = -22;
      hrvLabel = 'HRV deutlich unter Baseline.';
    } else if (hrvVsBaseline < 0.9) {
      hrvDelta = -14;
      hrvLabel = 'HRV unter Baseline.';
    } else if (hrvVsBaseline < 1.0) {
      hrvDelta = -6;
      hrvLabel = 'HRV leicht unter Baseline.';
    } else {
      hrvLabel = 'HRV auf/über Baseline.';
    }
  }
  rules.push({
    rule: 'hrv',
    label: hrvLabel,
    value: hrv,
    baseline: round2(hrvBaseline),
    delta: hrvDelta,
  });

  // Regel 3: Ruhepuls vs. Baseline (höher = weniger erholt).
  const restingHr = health?.restingHr ?? null;
  let rhrDelta = 0;
  let rhrVsBaseline: number | null = null;
  let rhrLabel = 'Keine Ruhepuls-Daten – neutral bewertet.';
  if (restingHr != null && rhrBaseline > 0) {
    rhrVsBaseline = round2(restingHr / rhrBaseline);
    const diff = restingHr - rhrBaseline;
    if (diff > 7) {
      rhrDelta = -20;
      rhrLabel = 'Ruhepuls deutlich erhöht.';
    } else if (diff > 3) {
      rhrDelta = -12;
      rhrLabel = 'Ruhepuls erhöht.';
    } else if (diff >= 1) {
      rhrDelta = -5;
      rhrLabel = 'Ruhepuls leicht erhöht.';
    } else {
      rhrLabel = 'Ruhepuls im Normalbereich.';
    }
  }
  rules.push({
    rule: 'rhr',
    label: rhrLabel,
    value: restingHr,
    baseline: round2(rhrBaseline),
    delta: rhrDelta,
  });

  // Regel 4: Belastung des Vortags. trainingLoad fehlt im Stub → Proxy aus
  // Dauer/Herzfrequenz. Härteste Einheit des Vortags zählt.
  const prevDate = previousDay(date);
  const yesterdayActivities = recentActivities.filter(
    (a) => a.startTime.slice(0, 10) === prevDate,
  );
  const hardest = yesterdayActivities.reduce<ReadinessActivityInput | null>(
    (max, a) => (max === null || a.durationSec > max.durationSec ? a : max),
    null,
  );
  let loadDelta = 0;
  let loadSignal = 0;
  let loadLabel = 'Keine Einheit am Vortag.';
  if (hardest) {
    const isHard =
      (hardest.trainingLoad != null && hardest.trainingLoad >= 150) ||
      hardest.durationSec >= 90 * 60 ||
      (hardest.avgHr != null && hardest.avgHr >= 150);
    const isModerate =
      hardest.durationSec >= 45 * 60 || (hardest.avgHr != null && hardest.avgHr >= 135);
    if (isHard) {
      loadDelta = -10;
      loadSignal = 1;
      loadLabel = 'Harte Einheit am Vortag.';
    } else if (isModerate) {
      loadDelta = -4;
      loadSignal = 0.5;
      loadLabel = 'Moderate Einheit am Vortag.';
    } else {
      loadSignal = 0.2;
      loadLabel = 'Leichte Einheit am Vortag.';
    }
  }
  rules.push({
    rule: 'load',
    label: loadLabel,
    value: hardest ? hardest.durationSec : null,
    baseline: null,
    delta: loadDelta,
  });

  const finalScore = Math.round(
    clamp(BASE_SCORE + sleepDelta + hrvDelta + rhrDelta + loadDelta, 0, 100),
  );

  const decision = decideFromScore(finalScore);

  const rationale: ReadinessRationale = {
    baseScore: BASE_SCORE,
    finalScore,
    inputs: {
      date,
      restingHr,
      hrv,
      sleepScore,
      totalSleepSec: sleep?.totalSleepSec ?? null,
      hrvBaseline: round2(hrvBaseline),
      restingHrBaseline: round2(rhrBaseline),
      lastActivity: hardest
        ? {
            type: hardest.type,
            startTime: hardest.startTime,
            durationSec: hardest.durationSec,
            avgHr: hardest.avgHr,
          }
        : null,
    },
    rules,
    note: DISCLAIMER,
  };

  return {
    date,
    readinessScore: finalScore,
    hrvVsBaseline,
    rhrVsBaseline,
    sleepFactor,
    loadSignal,
    decision,
    rationale,
    engineVersion: READINESS_ENGINE_VERSION,
  };
}

/** Score → Entscheidung. Höhere Readiness erlaubt höhere Intensität. */
export function decideFromScore(score: number): ReadinessDecision {
  if (score < 45) return 'rest';
  if (score < 65) return 'easy';
  if (score < 80) return 'normal';
  return 'hard';
}

const DECISION_TEXT: Record<ReadinessDecision, string> = {
  rest: 'Ruhetag empfohlen',
  easy: 'Lockeres Training',
  normal: 'Normales Training möglich',
  hard: 'Bereit für harte Einheit',
};

export function decisionText(decision: ReadinessDecision): string {
  return DECISION_TEXT[decision];
}

/**
 * Kurzer, menschenlesbarer Begründungstext aus der `rationale` – die größten
 * negativen Beiträge zuerst. Für Web-Karte und Bot-Ausgabe (reine Darstellung,
 * keine eigene Logik). Akzeptiert die `rationale` als unbekanntes JSON-Objekt
 * (z. B. aus der DB) und ist tolerant gegenüber fehlenden Feldern.
 */
export function summarizeReadiness(rationale: unknown): string {
  if (!rationale || typeof rationale !== 'object' || !('rules' in rationale)) {
    return 'Keine Begründung verfügbar.';
  }
  const rules = (rationale as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) return 'Keine Begründung verfügbar.';

  const negatives = rules
    .filter(
      (r): r is ReadinessRuleContribution =>
        !!r && typeof r === 'object' && typeof (r as { delta?: unknown }).delta === 'number',
    )
    .filter((r) => r.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2)
    .map((r) => r.label);

  if (negatives.length === 0) return 'Alle Werte im grünen Bereich.';
  return negatives.join(' ');
}
