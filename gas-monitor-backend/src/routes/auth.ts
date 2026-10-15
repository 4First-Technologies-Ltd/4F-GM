import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { issueOtp, issueTokenPair, devOtp } from '../lib/auth';
import { hashOtp, OTP_MAX_ATTEMPTS } from '../lib/otp';
import { verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { LEGAL_VERSION } from '../lib/legal';
import { loginLimiter, otpSendLimiter, otpVerifyLimiter, registerLimiter, sha256 } from '../lib/security';
import { validatePassword } from '../lib/password';
import { claimFleetInvite, effectiveRiderStatus, RIDER_STATUS_SELECT } from '../lib/fleet';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().superRefine(validatePassword),
  // BRANCH_MANAGER is deliberately absent: managers only join through a vendor's invite email.
  role: z.enum(['CONSUMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY']).optional().default('CONSUMER'),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms and Privacy Policy' }) }),
  legalVersion: z.string().refine((v) => v === LEGAL_VERSION, {
    message: 'The Terms have been updated. Please reload and review them again.'
  })
});

router.post(
  '/register',
  registerLimiter,
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

    await prisma.legalAcceptance.createMany({
      data: (['TERMS', 'PRIVACY'] as const).map((document) => ({
        userId: user.id,
        document,
        version: LEGAL_VERSION,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 255) ?? null
      })),
      skipDuplicates: true
    });

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
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const result = verifyOtpSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { email, otp } = result.data;
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        vendorProfile: { select: { status: true } },
        riderProfile: { select: RIDER_STATUS_SELECT },
        logisticsCompany: { select: { status: true } }
      }
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
        riderStatus: user.riderProfile ? effectiveRiderStatus(user.riderProfile) : undefined,
        companyStatus: user.logisticsCompany?.status ?? undefined,
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
  otpSendLimiter,
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

    const stored = await prisma.refreshToken.findUnique({ where: { token: sha256(refreshToken) } });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token revoked or expired' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, isSuspended: true } });
    if (!user || user.isSuspended) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Rotate: delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { token: sha256(refreshToken) } });
    const tokens = await issueTokenPair(user.id, user.email);

    return res.json(tokens);
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: sha256(refreshToken) } });
    }

    return res.json({ message: 'Logged out successfully' });
  })
);

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

router.post(
  '/forgot-password',
  otpSendLimiter,
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
  password: z.string().superRefine(validatePassword)
});

router.post(
  '/reset-password',
  otpVerifyLimiter,
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
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        vendorProfile: { select: { status: true } },
        riderProfile: { select: RIDER_STATUS_SELECT },
        logisticsCompany: { select: { status: true } }
      }
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
        riderStatus: user.riderProfile ? effectiveRiderStatus(user.riderProfile) : undefined,
        companyStatus: user.logisticsCompany?.status ?? undefined,
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
  vendorProfile: { select: { status: true } },
  riderProfile: { select: RIDER_STATUS_SELECT },
  logisticsCompany: { select: { status: true } }
} as const;

function serialize<
  T extends {
    vendorProfile: { status: string } | null;
    riderProfile: Parameters<typeof effectiveRiderStatus>[0] | null;
    logisticsCompany: { status: string } | null;
  }
>(user: T) {
  const { vendorProfile, riderProfile, logisticsCompany, ...userData } = user;
  return {
    ...userData,
    vendorStatus: vendorProfile?.status ?? undefined,
    riderStatus: riderProfile ? effectiveRiderStatus(riderProfile) : undefined,
    companyStatus: logisticsCompany?.status ?? undefined
  };
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    let user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: SELECT });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // A rider invited to a fleet after signing up joins here, so the approval
    // the invite grants shows on their very next status check.
    if (user.role === 'RIDER' && user.riderProfile) {
      const v = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } });
      const joined = await claimFleetInvite({ id: user.id, email: user.email, emailVerified: !!v?.emailVerified });
      if (joined) user = (await prisma.user.findUnique({ where: { id: req.user!.sub }, select: SELECT })) ?? user;
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

// ── Data rights: export and erasure (Nigeria Data Protection Act 2023) ─────────

/** A copy of everything we hold about the signed-in user. */
router.get(
  '/me/export',
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, phone: true, devicePhone: true, avatarUrl: true, role: true,
        emailVerified: true, pushEnabled: true, emailNotifEnabled: true, smsAlertsEnabled: true,
        unitPreference: true, createdAt: true,
        addresses: true,
        cylinderProfiles: true,
        legalAcceptances: true,
        orders: {
          select: {
            id: true, supplierName: true, cylinderSize: true, quantity: true, totalAmount: true,
            deliveryAddress: true, status: true, createdAt: true
          }
        },
        tickets: { include: { messages: true } }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.setHeader('Content-Disposition', 'attachment; filename="4fg-monitor-my-data.json"');
    return res.json({ exportedAt: new Date().toISOString(), data: user });
  })
);

const deleteAccountSchema = z.object({ password: z.string().min(1, 'Enter your password to confirm') });

/**
 * Self-service erasure. Orders are financial records we must keep, so the
 * account is anonymised in place rather than deleted: personal details, saved
 * addresses, devices and sessions are removed and the email can no longer sign
 * in or be marketed to. Vendors and riders hold payout records and are handled
 * by support.
 */
router.delete(
  '/me',
  requireAuth,
  loginLimiter,
  asyncHandler(async (req, res) => {
    const result = deleteAccountSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(result.data.password, user.password))) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    if (user.role !== 'CONSUMER') {
      return res.status(409).json({
        error: 'Vendor and rider accounts hold payout records. Contact support to close this account.',
        code: 'CONTACT_SUPPORT'
      });
    }
    const open = await prisma.order.count({
      where: { consumerId: user.id, status: { in: ['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY'] } }
    });
    if (open > 0) {
      return res.status(409).json({ error: 'You have an order in progress. Delete your account once it is complete.' });
    }

    const randomPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.address.deleteMany({ where: { userId: user.id } }),
      prisma.cylinderProfile.deleteMany({ where: { userId: user.id } }),
      prisma.marketingSuppression.upsert({
        where: { email: user.email.toLowerCase() },
        create: { email: user.email.toLowerCase(), reason: 'account_deleted' },
        update: {}
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          email: `deleted-${user.id}@deleted.invalid`,
          name: 'Deleted user',
          phone: null,
          devicePhone: null,
          avatarUrl: null,
          password: randomPassword,
          isSuspended: true,
          emailVerified: false,
          otpCodeHash: null,
          otpPurpose: null,
          otpExpiresAt: null,
          pushEnabled: false,
          emailNotifEnabled: false,
          smsAlertsEnabled: false
        }
      })
    ]);

    return res.json({ message: 'Your account has been deleted.' });
  })
);

export default router;
