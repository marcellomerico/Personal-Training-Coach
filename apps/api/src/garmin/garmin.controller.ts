import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GarminService } from './garmin.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SafeUser } from '../auth/auth.service';
import { SessionGuard } from '../auth/session.guard';
import { GarminAuthCompleteDto, GarminAuthStartDto } from './dto/garmin-auth.dto';

@Controller()
@UseGuards(SessionGuard)
export class GarminController {
  constructor(private readonly garmin: GarminService) {}

  @Post('providers/garmin/auth/start')
  @HttpCode(200)
  startAuth(@Body() body: GarminAuthStartDto) {
    return this.garmin.startAuth(body);
  }

  @Post('providers/garmin/auth/complete')
  @HttpCode(200)
  completeAuth(@CurrentUser() user: SafeUser, @Body() body: GarminAuthCompleteDto) {
    return this.garmin.completeAuth(user.id, body);
  }

  @Post('providers/garmin/connect')
  @HttpCode(200)
  connect(@CurrentUser() user: SafeUser) {
    return this.garmin.connect(user.id);
  }

  @Post('sync/garmin')
  @HttpCode(200)
  async sync(
    @CurrentUser() user: SafeUser,
    @Body() body: { since?: string } | undefined,
  ) {
    const since = body?.since ? new Date(body.since) : null;
    const result = await this.garmin.sync(user.id, since);
    return { ok: true, ...result };
  }

  @Get('sync/garmin/jobs')
  syncJobs(@CurrentUser() user: SafeUser, @Query('limit') limit?: string) {
    return this.garmin.latestSyncJobs(user.id, limit ? Number(limit) : undefined);
  }

  @Get('activities')
  activities(
    @CurrentUser() user: SafeUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.garmin.listActivities(user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('daily-health')
  dailyHealth(
    @CurrentUser() user: SafeUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.garmin.listDailyHealth(user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('sleep')
  sleep(
    @CurrentUser() user: SafeUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.garmin.listSleep(user.id, {
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
