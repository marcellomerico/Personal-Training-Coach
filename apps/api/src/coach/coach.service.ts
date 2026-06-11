import { Injectable } from '@nestjs/common';
import {
  buildCoachRecommendation,
  type CoachRecommendation,
  type ReadinessDecision,
} from '@ptc/analysis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Coach-Empfehlung (Phase 5, v0). Rein regelbasiert (kein LLM): leitet aus der
 * zuletzt gespeicherten Readiness-Bewertung eine konkrete Tagesempfehlung ab
 * (Rest/Easy/Normal/Hard + Guidance + Begründung). Die Logik lebt in
 * @ptc/analysis (buildCoachRecommendation); hier nur die user-scoped Ladung.
 */
@Injectable()
export class CoachService {
  constructor(private readonly prisma: PrismaService) {}

  async latestRecommendation(userId: string): Promise<CoachRecommendation | null> {
    const readiness = await this.prisma.readinessMetric.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    if (!readiness) return null;

    return buildCoachRecommendation({
      date: new Date(readiness.date).toISOString().slice(0, 10),
      readinessScore: readiness.readinessScore,
      decision: readiness.decision as ReadinessDecision,
      rationale: readiness.rationale,
    });
  }
}
