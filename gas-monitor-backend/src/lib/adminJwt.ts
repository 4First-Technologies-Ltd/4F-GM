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
}

export function signAdminSession(payload: Omit<AdminSessionPayload, 'admin'>): string {
  return jwt.sign({ admin: true, ...payload }, ADMIN_SECRET, { expiresIn: SESSION_EXPIRES_IN });
}

export function verifyAdminSession(token: string): AdminSessionPayload {
  return jwt.verify(token, ADMIN_SECRET) as AdminSessionPayload;
}
