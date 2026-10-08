import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { signAdminSession, ADMIN_SESSION_COOKIE } from '../../lib/adminJwt';
import { prisma } from '../../lib/prisma';
import { resolveAdminSession } from '../../middleware/requireAdmin';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog, writeAuthAudit } from '../../lib/audit';
import type { AdminRole } from '@prisma/client';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { username, password } = result.data;
    const validUsername = process.env.ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD;

    let token: string;
    let actor: { id: string; name: string; email: string; role: AdminRole };

    // The env account is a shared bootstrap/break-glass credential. Set
    // ADMIN_ROOT_LOGIN_DISABLED=true once named super admins exist.
    const rootEnabled = process.env.ADMIN_ROOT_LOGIN_DISABLED !== 'true';

    if (rootEnabled && validUsername && validPassword && username === validUsername && password === validPassword) {
      token = signAdminSession({
        adminId: 'root',
        username: validUsername,
        name: 'Root (shared env login)',
        role: 'SUPER_ADMIN'
      });
      actor = { id: 'root', name: 'Root (shared env login)', email: validUsername, role: 'SUPER_ADMIN' };
    } else {
      const admin = await prisma.adminUser.findUnique({ where: { email: username.toLowerCase() } });
      const passwordOk = admin ? await bcrypt.compare(password, admin.passwordHash) : false;

      if (!admin || !admin.isActive || !passwordOk) {
        await writeAuthAudit(req, {
          action: 'ADMIN_LOGIN_FAILED',
          actorId: admin?.id ?? 'unknown',
          actorName: admin?.name ?? 'Unknown',
          actorEmail: username,
          actorRole: admin?.role ?? 'SUPPORT',
          summary: `Failed admin sign-in for ${username}`
        });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      token = signAdminSession({
        adminId: admin.id,
        username: admin.email,
        name: admin.name,
        role: admin.role,
        tv: admin.tokenVersion
      });
      actor = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
    }

    await writeAuthAudit(req, {
      action: 'ADMIN_LOGIN',
      actorId: actor.id,
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      summary: `${actor.name} (${actor.email}) signed in`
    });

    res.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12 * 1000
    });
    return res.json({ ok: true });
  })
);

router.post('/logout', (_req, res) => {
  res.cookie(ADMIN_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res.json({ ok: true });
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const resolved = await resolveAdminSession(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { session, mustChangePassword } = resolved;
    return res.json({
      ok: true,
      name: session.name,
      role: session.role,
      mustChangePassword,
      // The env root account has no row, hence no password to change here.
      canChangePassword: session.adminId !== 'root'
    });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
});

// Deliberately not behind requireAdmin: an admin flagged mustChangePassword is
// blocked by that guard everywhere else, and this is the one route they need.
router.post(
  '/change-password',
  asyncHandler(async (req, res) => {
    const resolved = await resolveAdminSession(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const { session } = resolved;
    if (session.adminId === 'root') {
      return res
        .status(400)
        .json({ error: 'The shared env login has no stored password. Change ADMIN_PASSWORD in the environment.' });
    }

    const result = changePasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }
    const { currentPassword, newPassword } = result.data;
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one' });
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
    if (!admin || !(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false,
        tokenVersion: { increment: 1 }
      }
    });

    req.admin = session;
    await writeAuditLog(req, {
      action: 'ADMIN_PASSWORD_CHANGED',
      resource: 'admin',
      resourceId: admin.id,
      // Records THAT it changed, never any form of the value.
      summary: `${admin.name} (${admin.email}) changed their own password`,
      metadata: { email: admin.email }
    });

    // Every other session just became invalid; keep this one alive.
    res.cookie(
      ADMIN_SESSION_COOKIE,
      signAdminSession({
        adminId: admin.id,
        username: admin.email,
        name: admin.name,
        role: admin.role,
        tv: updated.tokenVersion
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12 * 1000
      }
    );
    return res.json({ ok: true });
  })
);

export default router;
