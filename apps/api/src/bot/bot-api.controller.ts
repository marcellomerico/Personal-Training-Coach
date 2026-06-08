import { Controller, Get, HttpCode, Post, Query, Body, UseGuards } from '@nestjs/common';
import { BotApiService } from './bot-api.service';
import { BotSyncDto } from './dto/bot-sync.dto';
import { InternalGuard } from '../auth/internal.guard';

@Controller('bot')
@UseGuards(InternalGuard)
export class BotApiController {
  constructor(private readonly botApi: BotApiService) {}

  @Get('today')
  today(@Query('telegramUserId') telegramUserId: string) {
    return this.botApi.today(telegramUserId);
  }

  @Get('last-activity')
  lastActivity(@Query('telegramUserId') telegramUserId: string) {
    return this.botApi.lastActivity(telegramUserId);
  }

  @Post('sync')
  @HttpCode(200)
  sync(@Body() dto: BotSyncDto) {
    return this.botApi.sync(dto.telegramUserId, dto.since ? new Date(dto.since) : null);
  }
}
