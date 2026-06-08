import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { loadEnv } from '@ptc/config';
import type { Request } from 'express';

/**
 * Schützt interne Service-zu-Service-Endpunkte (z. B. Bot -> API) über einen
 * Shared-Secret-Header. Ist INTERNAL_API_KEY nicht gesetzt (lokale Dev),
 * wird der Zugriff erlaubt.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  private readonly key = loadEnv().INTERNAL_API_KEY;

  canActivate(context: ExecutionContext): boolean {
    if (!this.key) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-internal-key');
    if (provided !== this.key) {
      throw new UnauthorizedException('Ungültiger interner Schlüssel.');
    }
    return true;
  }
}
