import { Injectable } from '@nestjs/common';
import {
  buildCoachRecommendation,
  type CoachRecommendation,
  type ReadinessDecision,
} from '@ptc/analysis';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';

/** Minimale Readiness-Felder, aus denen die Empfehlung gebaut wird. */
export interface ReadinessLike {
  date: Date | string;
  readinessScore: number;
  decision: string;
  rationale: unknown;
}

/**
 * Coach-Empfehlung (Phase 5). Die ENTSCHEIDUNG ist regelbasiert/deterministisch
 * (@ptc/analysis, kein LLM) – hier nur die user-scoped Ladung. Optional reichert
 * die Erklärungsschicht (Claude, LlmService) einen lesbaren `explanationText`
 * an; ist sie deaktiviert/fehlerhaft, bleibt das Feld null.
 */
@Injectable()
export class CoachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async latestRecommendation(userId: string): Promise<CoachRecommendation | null> {
    const readiness = await this.prisma.readinessMetric.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    return this.fromReadiness(readiness);
  }

  /** Baut die Empfehlung aus einer bereits geladenen Readiness (DRY für den Bot). */
  async fromReadiness(readiness: ReadinessLike | null): Promise<CoachRecommendation | null> {
    if (!readiness) return null;

    const recommendation = buildCoachRecommendation({
      date: new Date(readiness.date).toISOString().slice(0, 10),
      readinessScore: readiness.readinessScore,
      decision: readiness.decision as ReadinessDecision,
      rationale: readiness.rationale,
    });

    // Optionale Erklärungsschicht – ändert die Entscheidung nicht.
    recommendation.explanationText = await this.llm.explainRecommendation(recommendation);
    return recommendation;
  }
}
