import { NextFunction, Request, Response } from 'express';
import { ADMIN_SESSION_COOKIE, AdminSessionPayload, verifyAdminSession } from '../lib/adminJwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminSessionPayload;
    }
  }
}

export function getAdminSession(req: Request): AdminSessionPayload | null {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  try {
    return verifyAdminSession(token);
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = getAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.admin = session;
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const session = getAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (session.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  req.admin = session;
  next();
}
