import { Controller, Get, UseGuards } from '@nestjs/common';
import { CoachService } from './coach.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SafeUser } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';

/**
 * Coach-Empfehlung (user-scoped, SessionGuard).
 * - GET /coach/recommendation – konkrete Tagesempfehlung (oder null, wenn noch
 *   keine Readiness berechnet wurde).
 */
@Controller()
@UseGuards(SessionGuard)
export class CoachController {
  constructor(private readonly coach: CoachService) {}

  @Get('coach/recommendation')
  recommendation(@CurrentUser() user: SafeUser) {
    return this.coach.latestRecommendation(user.id);
  }
}
