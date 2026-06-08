export type UserId = string;

export type UserRole = 'user' | 'admin';

export interface User {
  id: UserId;
  email: string;
  role: UserRole;
  telegramUserId: string | null;
  createdAt: Date;
}

export interface UserProfile {
  userId: UserId;
  displayName: string | null;
  timezone: string;
  locale: string;
  /** Persönliche Baselines für die Analyse (optional, werden angereichert). */
  restingHrBaseline: number | null;
  hrvBaseline: number | null;
  maxHr: number | null;
}
