import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { signAdminSession, ADMIN_SESSION_COOKIE } from '../../lib/adminJwt';
import { prisma } from '../../lib/prisma';
import { getAdminSession } from '../../middleware/requireAdmin';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuthAudit } from '../../lib/audit';
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
        role: admin.role
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

router.get('/me', (req, res) => {
  const session = getAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  return res.json({ ok: true, name: session.name, role: session.role });
});

export default router;
