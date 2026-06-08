import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GarminService } from '../garmin/garmin.service';

export interface BotUserRef {
  id: string;
  displayName: string | null;
}

export interface BotTodayResponse {
  user: BotUserRef;
  date: string;
  health: {
    restingHr: number | null;
    hrv: number | null;
    bodyBattery: number | null;
    stressAvg: number | null;
    steps: number | null;
  } | null;
  sleep: {
    totalSleepSec: number | null;
    sleepScore: number | null;
    deepSec: number | null;
    remSec: number | null;
    awakeSec: number | null;
  } | null;
  latestActivity: BotActivitySummary | null;
}

export interface BotActivitySummary {
  type: string;
  startTime: Date;
  durationSec: number;
  distanceM: number | null;
  avgHr: number | null;
  calories: number | null;
}

@Injectable()
export class BotApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garmin: GarminService,
  ) {}

  async today(telegramUserIdRaw: string): Promise<BotTodayResponse> {
    const user = await this.resolveTelegramUser(telegramUserIdRaw);
    const [health, sleep, latestActivity] = await Promise.all([
      this.prisma.dailyHealthMetric.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.sleepRecord.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.activity.findFirst({
        where: { userId: user.id },
        orderBy: { startTime: 'desc' },
      }),
    ]);

    return {
      user,
      date: new Date().toISOString().slice(0, 10),
      health: health
        ? {
            restingHr: health.restingHr,
            hrv: health.hrv,
            bodyBattery: health.bodyBattery,
            stressAvg: health.stressAvg,
            steps: health.steps,
          }
        : null,
      sleep: sleep
        ? {
            totalSleepSec: sleep.totalSleepSec,
            sleepScore: sleep.sleepScore,
            deepSec: sleep.deepSec,
            remSec: sleep.remSec,
            awakeSec: sleep.awakeSec,
          }
        : null,
      latestActivity: latestActivity
        ? {
            type: latestActivity.type,
            startTime: latestActivity.startTime,
            durationSec: latestActivity.durationSec,
            distanceM: latestActivity.distanceM,
            avgHr: latestActivity.avgHr,
            calories: latestActivity.calories,
          }
        : null,
    };
  }

  async lastActivity(telegramUserIdRaw: string): Promise<{
    user: BotUserRef;
    activity: BotActivitySummary | null;
  }> {
    const user = await this.resolveTelegramUser(telegramUserIdRaw);
    const activity = await this.prisma.activity.findFirst({
      where: { userId: user.id },
      orderBy: { startTime: 'desc' },
    });

    return {
      user,
      activity: activity
        ? {
            type: activity.type,
            startTime: activity.startTime,
            durationSec: activity.durationSec,
            distanceM: activity.distanceM,
            avgHr: activity.avgHr,
            calories: activity.calories,
          }
        : null,
    };
  }

  async sync(
    telegramUserIdRaw: string,
    since: Date | null,
  ): Promise<{ user: BotUserRef; stats: Awaited<ReturnType<GarminService['sync']>> }> {
    const user = await this.resolveTelegramUser(telegramUserIdRaw);
    const stats = await this.garmin.sync(user.id, since);
    return { user, stats };
  }

  private async resolveTelegramUser(telegramUserIdRaw: string): Promise<BotUserRef> {
    let telegramUserId: bigint;
    try {
      telegramUserId = BigInt(telegramUserIdRaw);
    } catch {
      throw new NotFoundException('Telegram-Nutzer ist nicht verknüpft.');
    }

    const user = await this.prisma.user.findUnique({
      where: { telegramUserId },
      include: { profile: true },
    });

    if (!user || user.deletedAt || user.status !== 'active') {
      throw new NotFoundException('Telegram-Nutzer ist nicht verknüpft.');
    }

    return {
      id: user.id,
      displayName: user.profile?.displayName ?? null,
    };
  }
}
