import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InternalGuard } from '../auth/internal.guard';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: schneller Ping ohne Abhängigkeiten. */
  @Get()
  liveness(): { status: string; service: string; time: string } {
    return {
      status: 'ok',
      service: 'api',
      time: new Date().toISOString(),
    };
  }

  /** Readiness: DB + Garmin-Connector müssen erreichbar sein. */
  @Get('ready')
  async ready() {
    const result = await this.health.readiness();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }

  /** Ops-Snapshot: Sync-Job-Statistik der letzten 24h (intern geschützt). */
  @Get('ops')
  @UseGuards(InternalGuard)
  ops() {
    return this.health.opsSummary();
  }
}
