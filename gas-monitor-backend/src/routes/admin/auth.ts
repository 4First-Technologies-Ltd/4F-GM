import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { signAdminSession, signMfaChallenge, verifyMfaChallenge, ADMIN_SESSION_COOKIE } from '../../lib/adminJwt';
import { prisma } from '../../lib/prisma';
import { resolveAdminSession } from '../../middleware/requireAdmin';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog, writeAuthAudit } from '../../lib/audit';
import type { AdminRole } from '@prisma/client';
import { adminLoginLimiter, adminMfaLimiter, safeEqual } from '../../lib/security';
import { validatePassword } from '../../lib/password';
import {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  otpauthUri,
  verifyTotp
} from '../../lib/totp';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

type Actor = { id: string; name: string; email: string; role: AdminRole };

function setSessionCookie(res: Response, token: string) {
  res.cookie(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12 * 1000
  });
}

async function finishLogin(req: Request, res: Response, actor: Actor, token: string) {
  await writeAuthAudit(req, {
    action: 'ADMIN_LOGIN',
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    actorRole: actor.role,
    summary: `${actor.name} (${actor.email}) signed in`
  });
  setSessionCookie(res, token);
  return res.json({ ok: true });
}

const ROOT_ACTOR: Actor = { id: 'root', name: 'Root (shared env login)', email: 'root', role: 'SUPER_ADMIN' };
// The env root account has no row to remember the last accepted code in.
let rootLastStep: number | null = null;

router.post(
  '/login',
  adminLoginLimiter,
  asyncHandler(async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { username, password } = result.data;
    const validUsername = process.env.ADMIN_USERNAME;
    const validPassword = process.env.ADMIN_PASSWORD;

    // The env account is a shared bootstrap/break-glass credential. Set
    // ADMIN_ROOT_LOGIN_DISABLED=true once named super admins exist, or
    // ADMIN_ROOT_TOTP_SECRET (base32) to put a second factor on it.
    const rootEnabled = process.env.ADMIN_ROOT_LOGIN_DISABLED !== 'true';

    if (rootEnabled && validUsername && validPassword && safeEqual(username, validUsername) && safeEqual(password, validPassword)) {
      if (process.env.ADMIN_ROOT_TOTP_SECRET) {
        return res.json({ mfaRequired: true, challenge: signMfaChallenge({ adminId: 'root' }) });
      }
      return finishLogin(
        req,
        res,
        { ...ROOT_ACTOR, email: validUsername },
        signAdminSession({ adminId: 'root', username: validUsername, name: ROOT_ACTOR.name, role: 'SUPER_ADMIN' })
      );
    }

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

    // Password alone is not a session for an admin with a second factor.
    if (admin.mfaEnabled) {
      return res.json({ mfaRequired: true, challenge: signMfaChallenge({ adminId: admin.id, tv: admin.tokenVersion }) });
    }

    return finishLogin(
      req,
      res,
      { id: admin.id, name: admin.name, email: admin.email, role: admin.role },
      signAdminSession({
        adminId: admin.id,
        username: admin.email,
        name: admin.name,
        role: admin.role,
        tv: admin.tokenVersion
      })
    );
  })
);

const mfaLoginSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().trim().min(6).max(20)
});

const EXPIRED = { error: 'Your sign-in expired. Please start again.', code: 'MFA_CHALLENGE_EXPIRED' };

/** Second step of sign-in: trade the password-step challenge plus a code for a session. */
router.post(
  '/login/mfa',
  adminMfaLimiter,
  asyncHandler(async (req, res) => {
    const parsed = mfaLoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter the code from your authenticator app' });

    let challenge;
    try {
      challenge = verifyMfaChallenge(parsed.data.challenge);
    } catch {
      return res.status(401).json(EXPIRED);
    }
    const { code } = parsed.data;

    const fail = async (actor: Actor) => {
      await writeAuthAudit(req, {
        action: 'ADMIN_MFA_FAILED',
        actorId: actor.id,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRole: actor.role,
        summary: `Wrong second-factor code for ${actor.email}`
      });
      return res.status(401).json({ error: 'That code is not valid. Try the current code from your app.' });
    };

    if (challenge.adminId === 'root') {
      const secret = process.env.ADMIN_ROOT_TOTP_SECRET;
      const username = process.env.ADMIN_USERNAME;
      if (!secret || !username || process.env.ADMIN_ROOT_LOGIN_DISABLED === 'true') {
        return res.status(401).json(EXPIRED);
      }
      const step = verifyTotp(secret, code, rootLastStep);
      if (step == null) return fail({ ...ROOT_ACTOR, email: username });
      rootLastStep = step;
      return finishLogin(
        req,
        res,
        { ...ROOT_ACTOR, email: username },
        signAdminSession({ adminId: 'root', username, name: ROOT_ACTOR.name, role: 'SUPER_ADMIN' })
      );
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: challenge.adminId } });
    if (!admin || !admin.isActive || !admin.mfaEnabled || !admin.mfaSecret || admin.tokenVersion !== (challenge.tv ?? 0)) {
      return res.status(401).json(EXPIRED);
    }
    const actor: Actor = { id: admin.id, name: admin.name, email: admin.email, role: admin.role };

    if (!/^\d{6}$/.test(code) && looksLikeRecoveryCode(code)) {
      const hash = hashRecoveryCode(code);
      if (!admin.mfaRecoveryHashes.includes(hash)) return fail(actor);
      // Compare-and-set on the stored list so one code cannot be spent twice.
      const spent = await prisma.adminUser.updateMany({
        where: { id: admin.id, mfaRecoveryHashes: { has: hash } },
        data: { mfaRecoveryHashes: admin.mfaRecoveryHashes.filter((h) => h !== hash) }
      });
      if (spent.count !== 1) return fail(actor);
    } else {
      const step = verifyTotp(decryptSecret(admin.mfaSecret), code, admin.mfaLastStep);
      if (step == null) return fail(actor);
      const advanced = await prisma.adminUser.updateMany({
        where: { id: admin.id, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
        data: { mfaLastStep: step }
      });
      if (advanced.count !== 1) return fail(actor);
    }

    return finishLogin(
      req,
      res,
      actor,
      signAdminSession({ adminId: admin.id, username: admin.email, name: admin.name, role: admin.role, tv: admin.tokenVersion })
    );
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
    const { session, mustChangePassword, mfaEnabled, mfaEnrollRequired } = resolved;
    return res.json({
      ok: true,
      name: session.name,
      role: session.role,
      mustChangePassword,
      mfaEnabled,
      mfaEnrollRequired,
      // The env root account has no row, hence no password to change here.
      canChangePassword: session.adminId !== 'root'
    });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().superRefine(validatePassword)
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
      return res.status(400).json({ error: result.error.issues[0].message });
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
    setSessionCookie(
      res,
      signAdminSession({
        adminId: admin.id,
        username: admin.email,
        name: admin.name,
        role: admin.role,
        tv: updated.tokenVersion
      })
    );
    return res.json({ ok: true });
  })
);

// Like change-password, deliberately not behind requireAdmin: an admin who
// must enrol is blocked by that guard everywhere else.
router.post(
  '/mfa/setup',
  adminMfaLimiter,
  asyncHandler(async (req, res) => {
    const resolved = await resolveAdminSession(req);
    if (!resolved) return res.status(401).json({ error: 'Not authenticated' });
    const { session, mfaEnabled } = resolved;
    if (session.adminId === 'root') {
      return res.status(400).json({
        error: 'The shared env login cannot enrol here. Set ADMIN_ROOT_TOTP_SECRET on the server, or use a named admin account.'
      });
    }
    if (mfaEnabled) return res.status(409).json({ error: 'Two-factor authentication is already on for this account' });

    const secret = generateSecret();
    // Stored but not trusted until /mfa/enable proves the app can produce codes.
    await prisma.adminUser.update({ where: { id: session.adminId }, data: { mfaSecret: encryptSecret(secret) } });
    const uri = otpauthUri(session.username, secret);
    return res.json({ secret, otpauthUri: uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) });
  })
);

const mfaEnableSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

router.post(
  '/mfa/enable',
  adminMfaLimiter,
  asyncHandler(async (req, res) => {
    const resolved = await resolveAdminSession(req);
    if (!resolved) return res.status(401).json({ error: 'Not authenticated' });
    const { session, mfaEnabled } = resolved;
    if (session.adminId === 'root') return res.status(400).json({ error: 'Not available for the shared env login' });
    if (mfaEnabled) return res.status(409).json({ error: 'Two-factor authentication is already on for this account' });

    const parsed = mfaEnableSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const admin = await prisma.adminUser.findUnique({ where: { id: session.adminId } });
    if (!admin?.mfaSecret) return res.status(400).json({ error: 'Start setup first to get a QR code' });

    const step = verifyTotp(decryptSecret(admin.mfaSecret), parsed.data.code);
    if (step == null) return res.status(400).json({ error: 'That code is not valid. Check the time on your phone and try again.' });

    const recovery = generateRecoveryCodes();
    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        mfaEnabled: true,
        mfaLastStep: step,
        mfaRecoveryHashes: recovery.hashes,
        // Signs out every other session that was opened without the second factor.
        tokenVersion: { increment: 1 }
      }
    });

    req.admin = session;
    await writeAuditLog(req, {
      action: 'ADMIN_MFA_ENABLED',
      resource: 'admin',
      resourceId: admin.id,
      summary: `${admin.name} (${admin.email}) turned on two-factor authentication`
    });

    setSessionCookie(
      res,
      signAdminSession({ adminId: admin.id, username: admin.email, name: admin.name, role: admin.role, tv: updated.tokenVersion })
    );
    // Shown once. Only hashes are kept.
    return res.json({ ok: true, recoveryCodes: recovery.plain });
  })
);

export default router;
