import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { issueTokenPair } from '@/lib/server/auth';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/server/otp';

export const runtime = 'nodejs';

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code')
});

export async function POST(req: Request) {
  const result = verifyOtpSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { email, otp } = result.data;
  const user = await prisma.user.findUnique({
    where: { email },
    include: { vendorProfile: { select: { status: true } } }
  });

  if (!user || user.otpPurpose !== 'SIGNUP_VERIFICATION' || !user.otpExpiresAt) {
    return NextResponse.json({ error: 'No pending verification for this email', code: 'OTP_NOT_FOUND' }, { status: 400 });
  }
  if (user.otpExpiresAt < new Date()) {
    return NextResponse.json({ error: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' }, { status: 400 });
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.', code: 'OTP_LOCKED' }, { status: 429 });
  }
  if (user.otpCodeHash !== hashOtp(otp)) {
    await prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
    return NextResponse.json({ error: 'Incorrect code', code: 'OTP_INVALID' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, otpCodeHash: null, otpPurpose: null, otpExpiresAt: null, otpAttempts: 0 }
  });

  const tokens = await issueTokenPair(user.id, user.email);

  return NextResponse.json({
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
}
