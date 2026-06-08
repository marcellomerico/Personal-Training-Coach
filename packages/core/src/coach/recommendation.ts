import type { UserId } from '../domain/user';

/**
 * Tagesentscheidung des Coaches. Wird REGELBASIERT getroffen (deterministisch),
 * nicht vom LLM. Das LLM erklärt nur (siehe docs/architecture.md §4).
 */
export type DailyDecision = 'rest' | 'easy' | 'moderate' | 'hard';

/** Ein einzelner Datenbeleg, der zur Entscheidung beigetragen hat (Explainability). */
export interface RationaleItem {
  rule: string;
  metric: string;
  value: number | string | null;
  comparedTo?: number | string | null;
}

export interface Recommendation {
  userId: UserId;
  date: string; // YYYY-MM-DD
  decision: DailyDecision;
  /** Strukturierte, nachvollziehbare Begründung (welche Regeln/Werte). */
  rationale: RationaleItem[];
  /** Optionaler, vom LLM (Claude) generierter Klartext. Null, wenn LLM deaktiviert. */
  explanationText: string | null;
  engineVersion: string;
}
