export const GARMIN_REAL_AUTH_MODE = 'unofficial_real';

export function isRealGarminAuthMode(authMode: string | null | undefined): boolean {
  return authMode === GARMIN_REAL_AUTH_MODE;
}

export function hasGarminSessionToken(session: Record<string, unknown> | undefined): boolean {
  if (!session) return false;
  const token = session.session;
  return typeof token === 'string' && token.length > 0;
}

export class GarminSessionRequiredError extends Error {
  constructor(
    message = 'Garmin-Session fehlt oder ist ungültig. Bitte erneut mit Garmin verbinden.',
  ) {
    super(message);
    this.name = 'GarminSessionRequiredError';
  }
}

/** Wirft, wenn ein Real-Account ohne gültige Session synchronisiert werden soll. */
export function assertGarminSessionForRealAccount(
  authMode: string | null | undefined,
  session: Record<string, unknown> | undefined,
): void {
  if (isRealGarminAuthMode(authMode) && !hasGarminSessionToken(session)) {
    throw new GarminSessionRequiredError();
  }
}
