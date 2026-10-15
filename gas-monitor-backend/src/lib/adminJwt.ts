import jwt from 'jsonwebtoken';

const ADMIN_SECRET = process.env.ADMIN_JWT_SECRET!;
const SESSION_EXPIRES_IN = (process.env.ADMIN_SESSION_EXPIRES_IN ?? '12h') as jwt.SignOptions['expiresIn'];

export const ADMIN_SESSION_COOKIE = 'admin_session';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';

export interface AdminSessionPayload {
  admin: true;
  adminId: string;
  username: string;
  name: string;
  role: AdminRole;
  /** AdminUser.tokenVersion at issue time. Absent for the env root account. */
  tv?: number;
}

export function signAdminSession(payload: Omit<AdminSessionPayload, 'admin'>): string {
  return jwt.sign({ admin: true, ...payload }, ADMIN_SECRET, { expiresIn: SESSION_EXPIRES_IN });
}

export function verifyAdminSession(token: string): AdminSessionPayload {
  const payload = jwt.verify(token, ADMIN_SECRET) as AdminSessionPayload & { mfa?: boolean };
  // A password-only MFA challenge is signed with the same key; it must never
  // be accepted as a session.
  if (payload.admin !== true || payload.mfa) throw new Error('Not an admin session');
  return payload;
}

/** Proof that the password step passed; exchanged for a session after the code. */
export interface MfaChallengePayload {
  mfa: true;
  adminId: string;
  tv?: number;
}

export function signMfaChallenge(payload: Omit<MfaChallengePayload, 'mfa'>): string {
  return jwt.sign({ mfa: true, ...payload }, ADMIN_SECRET, { expiresIn: '5m' });
}

export function verifyMfaChallenge(token: string): MfaChallengePayload {
  const payload = jwt.verify(token, ADMIN_SECRET) as MfaChallengePayload & { admin?: boolean };
  if (payload.mfa !== true || payload.admin) throw new Error('Not an MFA challenge');
  return payload;
}
