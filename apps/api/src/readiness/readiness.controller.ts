import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ReadinessService } from './readiness.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SafeUser } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';

/**
 * Readiness-Endpunkte (user-scoped, SessionGuard).
 * - POST /analysis/readiness/recompute – Bewertung (neu) berechnen
 * - GET  /readiness/latest             – zuletzt berechnete Bewertung
 */
@Controller()
@UseGuards(SessionGuard)
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Post('analysis/readiness/recompute')
  @HttpCode(200)
  recompute(@CurrentUser() user: SafeUser, @Body() body?: { date?: string }) {
    return this.readiness.recompute(user.id, body?.date ?? null);
  }

  @Get('readiness/latest')
  latest(@CurrentUser() user: SafeUser) {
    return this.readiness.latest(user.id);
  }
}
