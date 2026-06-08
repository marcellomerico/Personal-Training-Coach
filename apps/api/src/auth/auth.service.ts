import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { loadEnv } from '@ptc/config';
import { Prisma, type User } from '@ptc/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from './crypto.util';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

/** Nutzer-Repräsentation ohne Geheimnisse – sicher für API-Responses. */
export interface SafeUser {
  id: string;
  email: string;
  role: User['role'];
  status: User['status'];
  telegramUserId: string | null;
  displayName: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LINK_TOKEN_TTL_MIN = 15;

@Injectable()
export class AuthService {
  private readonly env = loadEnv();

  constructor(private readonly prisma: PrismaService) {}

  // --- Registrierung / Login / Session ------------------------------------

  async register(
    dto: RegisterDto,
    userAgent?: string,
  ): Promise<{ user: SafeUser; sessionToken: string; expiresAt: Date }> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('E-Mail ist bereits registriert.');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        profile: {
          create: {
            displayName: dto.displayName ?? null,
          },
        },
      },
      include: { profile: true },
    });

    const session = await this.createSession(user.id, userAgent);
    return { user: this.toSafeUser(user, user.profile?.displayName ?? null), ...session };
  }

  async login(
    dto: LoginDto,
    userAgent?: string,
  ): Promise<{ user: SafeUser; sessionToken: string; expiresAt: Date }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch.');
    }
    if (user.status === 'disabled') {
      throw new UnauthorizedException('Konto ist deaktiviert.');
    }
    const valid = await verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch.');
    }

    const session = await this.createSession(user.id, userAgent);
    return { user: this.toSafeUser(user, user.profile?.displayName ?? null), ...session };
  }

  async logout(sessionToken: string | undefined): Promise<void> {
    if (!sessionToken) return;
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashToken(sessionToken) },
    });
  }

  /** Validiert ein Session-Token (aus dem Cookie) und liefert den Nutzer. */
  async validateSession(sessionToken: string): Promise<SafeUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(sessionToken) },
      include: { user: { include: { profile: true } } },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    const { user } = session;
    if (user.deletedAt || user.status === 'disabled') return null;
    return this.toSafeUser(user, user.profile?.displayName ?? null);
  }

  private async createSession(
    userId: string,
    userAgent?: string,
  ): Promise<{ sessionToken: string; expiresAt: Date }> {
    const sessionToken = generateToken(32);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * MS_PER_DAY);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(sessionToken),
        expiresAt,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
    });
    return { sessionToken, expiresAt };
  }

  // --- Telegram-Verknüpfung ------------------------------------------------

  /** Erzeugt einen kurzlebigen Einmal-Token + Deep-Link zum Verknüpfen. */
  async createTelegramLinkToken(
    userId: string,
  ): Promise<{ token: string; deepLink: string | null; expiresAt: Date }> {
    const token = generateToken(24);
    const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MIN * 60 * 1000);
    await this.prisma.telegramLinkToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });
    const botUsername = this.env.TELEGRAM_BOT_USERNAME;
    const deepLink = botUsername
      ? `https://t.me/${botUsername}?start=${token}`
      : null;
    return { token, deepLink, expiresAt };
  }

  /** Wird vom Bot aufgerufen: bestätigt die Verknüpfung anhand des Tokens. */
  async confirmTelegramLink(
    token: string,
    telegramUserIdRaw: string,
  ): Promise<{ userId: string }> {
    const record = await this.prisma.telegramLinkToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Link-Token ist ungültig oder abgelaufen.');
    }

    let telegramUserId: bigint;
    try {
      telegramUserId = BigInt(telegramUserIdRaw);
    } catch {
      throw new ConflictException('Ungültige Telegram-User-ID.');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: record.userId },
          data: { telegramUserId },
        }),
        this.prisma.telegramLinkToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
      ]);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Dieses Telegram-Konto ist bereits mit einem anderen Nutzer verknüpft.',
        );
      }
      throw err;
    }

    return { userId: record.userId };
  }

  // --- Helpers -------------------------------------------------------------

  private toSafeUser(user: User, displayName: string | null): SafeUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      telegramUserId: user.telegramUserId?.toString() ?? null,
      displayName,
    };
  }
}
