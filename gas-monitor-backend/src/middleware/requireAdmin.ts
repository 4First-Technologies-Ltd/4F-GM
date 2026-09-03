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

/**
 * Admin roles are ranked. Every guard below compares against these ranks rather
 * than testing a single role string, so adding a role between two existing ones
 * does not silently widen access.
 */
const ROLE_RANK = {
  SUPPORT: 0,
  OPERATIONS: 1,
  SUPER_ADMIN: 2
} as const;

export function getAdminSession(req: Request): AdminSessionPayload | null {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  try {
    return verifyAdminSession(token);
  } catch {
    return null;
  }
}

function guard(minRole: keyof typeof ROLE_RANK, message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = getAdminSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if ((ROLE_RANK[session.role] ?? -1) < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: message });
    }
    req.admin = session;
    next();
  };
}

/** Any authenticated admin. Read access. */
export const requireAdmin = guard('SUPPORT', 'Admin access required');

/**
 * Mutating operations on platform data — vendor approval, listing stock, user
 * records, platform settings. SUPPORT is read-only and must not reach these.
 */
export const requireOperations = guard('OPERATIONS', 'Operations access required');

/** Managing other admins. */
export const requireSuperAdmin = guard('SUPER_ADMIN', 'Super admin access required');
