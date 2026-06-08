import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { SessionGuard } from './session.guard';

/**
 * Auth-Modul (Phase 1): Registrierung/Login, Sessions (httpOnly-Cookie),
 * Rollen sowie Telegram-Account-Verknüpfung via Einmal-Token/Deep-Link.
 * PrismaService kommt aus dem globalen PrismaModule.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, RolesGuard],
  exports: [AuthService, SessionGuard, RolesGuard],
})
export class AuthModule {}
