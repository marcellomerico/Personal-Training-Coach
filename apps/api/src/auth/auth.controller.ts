import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { loadEnv } from '@ptc/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, type SafeUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TelegramConfirmDto } from './dto/telegram-confirm.dto';
import { InternalGuard } from './internal.guard';
import { SessionGuard } from './session.guard';

@Controller('auth')
export class AuthController {
  private readonly env = loadEnv();

  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SafeUser }> {
    const { user, sessionToken, expiresAt } = await this.auth.register(
      dto,
      req.header('user-agent'),
    );
    this.setSessionCookie(res, sessionToken, expiresAt);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: SafeUser }> {
    const { user, sessionToken, expiresAt } = await this.auth.login(
      dto,
      req.header('user-agent'),
    );
    this.setSessionCookie(res, sessionToken, expiresAt);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = (req as Request & { cookies?: Record<string, string> })
      .cookies?.[this.env.SESSION_COOKIE_NAME];
    await this.auth.logout(token);
    res.clearCookie(this.env.SESSION_COOKIE_NAME, this.cookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SafeUser): { user: SafeUser } {
    return { user };
  }

  @Post('telegram/link-token')
  @UseGuards(SessionGuard)
  async createLinkToken(
    @CurrentUser() user: SafeUser,
  ): Promise<{ token: string; deepLink: string | null; expiresAt: Date }> {
    return this.auth.createTelegramLinkToken(user.id);
  }

  @Post('telegram/confirm')
  @HttpCode(200)
  @UseGuards(InternalGuard)
  async confirmLink(
    @Body() dto: TelegramConfirmDto,
  ): Promise<{ ok: true; userId: string }> {
    const { userId } = await this.auth.confirmTelegramLink(
      dto.token,
      dto.telegramUserId,
    );
    return { ok: true, userId };
  }

  // --- Cookie-Helper -------------------------------------------------------

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      path: '/',
    };
  }

  private setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(this.env.SESSION_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      expires: expiresAt,
    });
  }
}
