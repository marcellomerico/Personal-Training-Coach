import { Injectable } from '@nestjs/common';
import { createLogger } from '@ptc/config';
import { computeAndStoreReadiness } from '@ptc/ingest';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Readiness (Phase 5). Die eigentliche Berechnung lebt in @ptc/ingest
 * (computeAndStoreReadiness) und wird von API UND Worker genutzt – hier nur
 * die user-scoped Orchestrierung. Keine doppelte Business-Logik.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = createLogger('readiness');

  constructor(private readonly prisma: PrismaService) {}

  /** Berechnet die Readiness neu (Standard: jüngster Datentag) und speichert sie. */
  async recompute(userId: string, date: string | null) {
    const readiness = await computeAndStoreReadiness(this.prisma, userId, date, this.logger);
    return { ok: true, readiness };
  }

  /** Liefert die zuletzt berechnete Readiness des Nutzers (oder null). */
  latest(userId: string) {
    return this.prisma.readinessMetric.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
  }

  /** Liefert die letzten Readiness-Werte, neueste zuerst. */
  history(userId: string, limit = 14) {
    return this.prisma.readinessMetric.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: Math.min(Math.max(limit, 1), 60),
    });
  }
}
