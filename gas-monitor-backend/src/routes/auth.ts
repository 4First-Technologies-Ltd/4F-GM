import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { issueOtp, issueTokenPair, devOtp } from '../lib/auth';
import { hashOtp, OTP_MAX_ATTEMPTS } from '../lib/otp';
import { verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['CONSUMER', 'VENDOR']).optional().default('CONSUMER')
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { name, email, password, role } = result.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.emailVerified) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { name, password: hashedPassword, role } })
      : await prisma.user.create({ data: { name, email, password: hashedPassword, role } });

    const otp = await issueOtp(user.id, user.email, 'SIGNUP_VERIFICATION');

    return res.status(201).json({
      message: 'Account created. Enter the code we emailed you to verify your address.',
      email: user.email,
      ...devOtp(otp)
    });
  })
);

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code')
});

router.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    const result = verifyOtpSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email, otp } = result.data;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { vendorProfile: { select: { status: true } } }
    });

    if (!user || user.otpPurpose !== 'SIGNUP_VERIFICATION' || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'No pending verification for this email', code: 'OTP_NOT_FOUND' });
    }
    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' });
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.', code: 'OTP_LOCKED' });
    }
    if (user.otpCodeHash !== hashOtp(otp)) {
      await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Incorrect code', code: 'OTP_INVALID' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, otpCodeHash: null, otpPurpose: null, otpExpiresAt: null, otpAttempts: 0 }
    });

    const tokens = await issueTokenPair(user.id, user.email);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        vendorStatus: user.vendorProfile?.status ?? undefined,
        createdAt: user.createdAt
      },
      ...tokens
    });
  })
);

const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['SIGNUP_VERIFICATION', 'PASSWORD_RESET'])
});

router.post(
  '/resend-otp',
  asyncHandler(async (req, res) => {
    const result = resendOtpSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email, purpose } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });

    const generic = { message: 'If an account matches, a new code has been sent.' };

    if (!user) {
      return res.json(generic);
    }
    if (purpose === 'SIGNUP_VERIFICATION' && user.emailVerified) {
      return res.json(generic);
    }

    const otp = await issueOtp(user.id, user.email, purpose);
    return res.json({ ...generic, ...devOtp(otp) });
  })
);

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const result = refreshSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { refreshToken } = result.data;

    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate: delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    const tokens = await issueTokenPair(user.id, user.email);

    return res.json(tokens);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }

    return res.json({ message: 'Logged out successfully' });
  })
);

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });

    const generic = { message: 'If an account exists for that email, a code has been sent.' };

    if (!user) {
      return res.json(generic);
    }

    const otp = await issueOtp(user.id, user.email, 'PASSWORD_RESET');
    return res.json({ ...generic, ...devOtp(otp) });
  })
);

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email, otp, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.otpPurpose !== 'PASSWORD_RESET' || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'No pending reset for this email', code: 'OTP_NOT_FOUND' });
    }
    if (user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' });
    }
    if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.', code: 'OTP_LOCKED' });
    }
    if (user.otpCodeHash !== hashOtp(otp)) {
      await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Incorrect code', code: 'OTP_INVALID' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        otpCodeHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
        otpAttempts: 0
      }
    });

    // Reset revokes all existing sessions.
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    return res.json({ message: 'Password updated. Please sign in with your new password.' });
  })
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { vendorProfile: { select: { status: true } } }
    });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    }

    if (user.isSuspended) {
      return res.status(403).json({ error: 'This account has been suspended. Contact support for help.', code: 'ACCOUNT_SUSPENDED' });
    }

    const tokens = await issueTokenPair(user.id, user.email);

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        vendorStatus: user.vendorProfile?.status ?? undefined,
        createdAt: user.createdAt
      },
      ...tokens
    });
  })
);

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  role: true,
  pushEnabled: true,
  emailNotifEnabled: true,
  smsAlertsEnabled: true,
  unitPreference: true,
  createdAt: true,
  updatedAt: true,
  vendorProfile: { select: { status: true } }
} as const;

function serialize<T extends { vendorProfile: { status: string } | null }>(user: T) {
  const { vendorProfile, ...userData } = user;
  return { ...userData, vendorStatus: vendorProfile?.status ?? undefined };
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: SELECT });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user: serialize(user) });
  })
);

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  pushEnabled: z.boolean().optional(),
  emailNotifEnabled: z.boolean().optional(),
  smsAlertsEnabled: z.boolean().optional(),
  unitPreference: z.enum(['KG', 'LBS']).optional()
});

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = updateSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: result.data,
      select: SELECT
    });

    return res.json({ user: serialize(user) });
  })
);

export default router;
