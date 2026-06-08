import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ptc/db';

export const ROLES_KEY = 'roles';

/** Beschränkt einen Handler auf bestimmte Rollen (zusammen mit RolesGuard). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
