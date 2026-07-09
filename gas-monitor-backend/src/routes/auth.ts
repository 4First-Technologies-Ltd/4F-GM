import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshTokenExpiresAt,
} from '../lib/jwt.js';
import { authenticate, AuthRequest } from '../middleware/authenticate.js';
import { generateOtp, hashOtp, otpExpiresAt, OTP_MAX_ATTEMPTS } from '../lib/otp.js';
import { sendOtpEmail } from '../lib/email.js';

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['CONSUMER', 'VENDOR']).optional().default('CONSUMER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code'),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['SIGNUP_VERIFICATION', 'PASSWORD_RESET']),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });
  const rawRefresh = signRefreshToken({ sub: userId });

  await prisma.refreshToken.create({
    data: {
      token: rawRefresh,
      userId,
      expiresAt: refreshTokenExpiresAt(),
    },
  });

  return { accessToken, refreshToken: rawRefresh };
}

async function issueOtp(userId: string, email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET') {
  const otp = generateOtp();
  await prisma.user.update({
    where: { id: userId },
    data: {
      otpCodeHash: hashOtp(otp),
      otpPurpose: purpose,
      otpExpiresAt: otpExpiresAt(),
      otpAttempts: 0,
    },
  });
  await sendOtpEmail(email, otp, purpose);
  return otp;
}

function devOtp(otp: string): { otp?: string } {
  return process.env.NODE_ENV !== 'production' ? { otp } : {};
}

// ── POST /auth/register ───────────────────────────────────────────────────────
// Creates an unverified account and sends a signup OTP. No session is issued
// until the email is verified via POST /auth/verify-otp.

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { name, email, password, role } = result.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.emailVerified) {
    res.status(409).json({ error: 'An account with that email already exists' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: { name, password: hashedPassword, role },
      })
    : await prisma.user.create({ data: { name, email, password: hashedPassword, role } });

  const otp = await issueOtp(user.id, user.email, 'SIGNUP_VERIFICATION');

  res.status(201).json({
    message: 'Account created. Enter the code we emailed you to verify your address.',
    email: user.email,
    ...devOtp(otp),
  });
});

// ── POST /auth/verify-otp ───────────────────────────────────────────────────
// Verifies a signup OTP and issues a session, exactly like /register used to.

router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const result = verifyOtpSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email, otp } = result.data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { vendorProfile: { select: { status: true } } },
  });

  if (!user || user.otpPurpose !== 'SIGNUP_VERIFICATION' || !user.otpExpiresAt) {
    res.status(400).json({ error: 'No pending verification for this email', code: 'OTP_NOT_FOUND' });
    return;
  }
  if (user.otpExpiresAt < new Date()) {
    res.status(400).json({ error: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' });
    return;
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many attempts. Request a new code.', code: 'OTP_LOCKED' });
    return;
  }
  if (user.otpCodeHash !== hashOtp(otp)) {
    await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
    res.status(400).json({ error: 'Incorrect code', code: 'OTP_INVALID' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, otpCodeHash: null, otpPurpose: null, otpExpiresAt: null, otpAttempts: 0 },
  });

  const tokens = await issueTokenPair(user.id, user.email);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendorStatus: user.vendorProfile?.status ?? undefined,
      createdAt: user.createdAt,
    },
    ...tokens,
  });
});

// ── POST /auth/resend-otp ───────────────────────────────────────────────────

router.post('/resend-otp', async (req: Request, res: Response): Promise<void> => {
  const result = resendOtpSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email, purpose } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = { message: 'If an account matches, a new code has been sent.' };

  if (!user) {
    res.json(generic);
    return;
  }
  if (purpose === 'SIGNUP_VERIFICATION' && user.emailVerified) {
    res.json(generic);
    return;
  }

  const otp = await issueOtp(user.id, user.email, purpose);
  res.json({ ...generic, ...devOtp(otp) });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid email or password' });
    return;
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { vendorProfile: { select: { status: true } } },
  });
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({ error: 'Please verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' });
    return;
  }

  const tokens = await issueTokenPair(user.id, user.email);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendorStatus: user.vendorProfile?.status ?? undefined,
      createdAt: user.createdAt,
    },
    ...tokens,
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const result = refreshSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { refreshToken } = result.data;

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    res.status(401).json({ error: 'Refresh token revoked or expired' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true },
  });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  // Rotate: delete old token, issue new pair
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const tokens = await issueTokenPair(user.id, user.email);

  res.json(tokens);
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  res.json({ message: 'Logged out successfully' });
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      vendorProfile: { select: { status: true } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const { vendorProfile, ...userData } = user;
  res.json({ user: { ...userData, vendorStatus: vendorProfile?.status ?? undefined } });
});

// ── POST /auth/forgot-password ──────────────────────────────────────────────
// Sends a password-reset OTP. Always responds the same way regardless of
// whether the account exists, so this endpoint can't be used to enumerate accounts.

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = { message: 'If an account exists for that email, a code has been sent.' };

  if (!user) {
    res.json(generic);
    return;
  }

  const otp = await issueOtp(user.id, user.email, 'PASSWORD_RESET');
  res.json({ ...generic, ...devOtp(otp) });
});

// ── POST /auth/reset-password ───────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email, otp, password } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.otpPurpose !== 'PASSWORD_RESET' || !user.otpExpiresAt) {
    res.status(400).json({ error: 'No pending reset for this email', code: 'OTP_NOT_FOUND' });
    return;
  }
  if (user.otpExpiresAt < new Date()) {
    res.status(400).json({ error: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' });
    return;
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many attempts. Request a new code.', code: 'OTP_LOCKED' });
    return;
  }
  if (user.otpCodeHash !== hashOtp(otp)) {
    await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
    res.status(400).json({ error: 'Incorrect code', code: 'OTP_INVALID' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      otpCodeHash: null,
      otpPurpose: null,
      otpExpiresAt: null,
      otpAttempts: 0,
    },
  });

  // Reset revokes all existing sessions.
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  res.json({ message: 'Password updated. Please sign in with your new password.' });
});

export default router;
