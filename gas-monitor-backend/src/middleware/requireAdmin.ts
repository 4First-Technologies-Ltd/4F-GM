import { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import type { SmosRole } from '@prisma/client';
import { effectiveSmosRole, smosCan, type SmosEffectiveRole } from '../lib/smois';
import { ADMIN_SESSION_COOKIE, AdminSessionPayload, verifyAdminSession } from '../lib/adminJwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminSessionPayload;
      /** Set by requireSmois: who this admin is inside the social media module. */
      smos?: SmosEffectiveRole;
    }
  }
}

/**
 * Admin roles are ranked. Every guard below compares against these ranks rather
 * than testing a single role string, so adding a role between two existing ones
 * does not silently widen access.
 */
const ROLE_RANK = {
  // Below every guard: a SOCIAL admin is refused by all platform admin routes.
  SOCIAL: -1,
  SUPPORT: 0,
  OPERATIONS: 1,
  SUPER_ADMIN: 2
} as const;

/** Every named admin needs a second factor unless explicitly switched off. */
export const mfaRequired = () => process.env.ADMIN_MFA_REQUIRED !== 'false';

export function getAdminSession(req: Request): AdminSessionPayload | null {
  const token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token) return null;
  try {
    return verifyAdminSession(token);
  } catch {
    return null;
  }
}

/**
 * The cookie alone is not enough: a signed token stays cryptographically valid
 * for its whole lifetime. For named admins we also check the database, so that
 * deactivating an admin, resetting their password or having them change it
 * takes effect on the very next request instead of when the token expires.
 * The env root account has no row and is exempt.
 */
export async function resolveAdminSession(
  req: Request
): Promise<{
  session: AdminSessionPayload;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  smosRole: SmosRole | null;
  /** Policy says this admin needs a second factor and has not set one up yet. */
  mfaEnrollRequired: boolean;
} | null> {
  const session = getAdminSession(req);
  if (!session) return null;
  if (session.adminId === 'root') {
    return { session, mustChangePassword: false, mfaEnabled: false, smosRole: null, mfaEnrollRequired: false };
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: session.adminId },
    select: { isActive: true, tokenVersion: true, mustChangePassword: true, role: true, mfaEnabled: true, smosRole: true }
  });
  if (!admin || !admin.isActive || admin.tokenVersion !== (session.tv ?? 0)) return null;

  // Role comes from the database, so a role change is also immediate.
  return {
    session: { ...session, role: admin.role },
    mustChangePassword: admin.mustChangePassword,
    mfaEnabled: admin.mfaEnabled,
    smosRole: admin.smosRole,
    mfaEnrollRequired: mfaRequired() && !admin.mfaEnabled
  };
}

function guard(minRole: keyof typeof ROLE_RANK, message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveAdminSession(req);
      if (!resolved) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      if (resolved.mustChangePassword) {
        return res
          .status(403)
          .json({ error: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      if (resolved.mfaEnrollRequired) {
        return res
          .status(403)
          .json({ error: 'Set up two-factor authentication to continue', code: 'MFA_ENROLLMENT_REQUIRED' });
      }
      if ((ROLE_RANK[resolved.session.role] ?? -1) < ROLE_RANK[minRole]) {
        return res.status(403).json({ error: message });
      }
      req.admin = resolved.session;
      next();
    } catch (err) {
      next(err);
    }
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

/**
 * Guard for /api/admin/smois. Same session, password-change and MFA rules as the
 * platform guards, but access is decided by the admin's SMOIS role, not their
 * platform rank. Sets `req.smos` for handlers that scope data by role.
 */
export function requireSmois(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resolved = await resolveAdminSession(req);
      if (!resolved) return res.status(401).json({ error: 'Not authenticated' });
      if (resolved.mustChangePassword) {
        return res
          .status(403)
          .json({ error: 'You must change your password before continuing', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
      if (resolved.mfaEnrollRequired) {
        return res
          .status(403)
          .json({ error: 'Set up two-factor authentication to continue', code: 'MFA_ENROLLMENT_REQUIRED' });
      }
      const effective = effectiveSmosRole(resolved.session.role, resolved.smosRole);
      if (!smosCan(effective, permission)) {
        return res.status(403).json({ error: 'You do not have access to this part of Social Media Operations' });
      }
      req.admin = resolved.session;
      req.smos = effective!;
      next();
    } catch (err) {
      next(err);
    }
  };
}
