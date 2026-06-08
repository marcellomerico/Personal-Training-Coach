import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { loadEnv } from '@ptc/config';
import type { Request } from 'express';
import { AuthService, type SafeUser } from './auth.service';

/** Request mit aufgelöstem Nutzer (durch SessionGuard gesetzt). */
export interface AuthedRequest extends Request {
  user?: SafeUser;
  cookies: Record<string, string>;
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly cookieName = loadEnv().SESSION_COOKIE_NAME;

  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = req.cookies?.[this.cookieName];
    if (!token) {
      throw new UnauthorizedException('Nicht angemeldet.');
    }
    const user = await this.auth.validateSession(token);
    if (!user) {
      throw new UnauthorizedException('Sitzung ungültig oder abgelaufen.');
    }
    req.user = user;
    return true;
  }
}
