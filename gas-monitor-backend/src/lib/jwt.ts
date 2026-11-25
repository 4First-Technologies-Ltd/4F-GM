import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'];

/**
 * Refresh tokens last REFRESH_DAYS and are renewed on every use (rotation), so a
 * session only ends after that many days without opening the app, or on sign-out,
 * password change, suspension or account deletion. `JWT_REFRESH_EXPIRES_IN`
 * overrides it, in days ("90d" or "90").
 */
const REFRESH_DAYS = (() => {
  const raw = process.env.JWT_REFRESH_EXPIRES_IN ?? '90d';
  const days = parseInt(raw.replace(/d$/i, ''), 10);
  return Number.isFinite(days) && days > 0 ? days : 90;
})();

export interface AccessTokenPayload {
  sub: string; // user id
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

/**
 * The random `jti` keeps every token unique: two issued to the same user in the
 * same second (two quick refreshes) would otherwise be identical and collide on
 * the stored hash.
 */
export function signRefreshToken(payload: { sub: string }): string {
  return jwt.sign({ ...payload, jti: randomUUID() }, REFRESH_SECRET, { expiresIn: `${REFRESH_DAYS}d` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}

export function refreshTokenExpiresAt(): Date {
  const date = new Date();
  date.setDate(date.getDate() + REFRESH_DAYS);
  return date;
}

/** How long a refresh token still works after it has been rotated (see POST /api/auth/refresh). */
export const REFRESH_REUSE_GRACE_MS = 60_000;
