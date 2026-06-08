import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ptc/db';
import type { AuthedRequest } from './session.guard';
import { ROLES_KEY } from './roles.decorator';

/**
 * Prüft Rollen-Metadaten. Setzt voraus, dass der SessionGuard zuvor den
 * Nutzer aufgelöst hat (Reihenfolge in @UseGuards beachten).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user || !required.includes(req.user.role)) {
      throw new ForbiddenException('Keine Berechtigung.');
    }
    return true;
  }
}
