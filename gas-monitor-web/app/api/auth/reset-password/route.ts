import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { hashOtp, OTP_MAX_ATTEMPTS } from '@/lib/server/otp';

export const runtime = 'nodejs';

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'Enter the 6-digit code'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export async function POST(req: Request) {
  const result = resetPasswordSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { email, otp, password } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || user.otpPurpose !== 'PASSWORD_RESET' || !user.otpExpiresAt) {
    return NextResponse.json({ error: 'No pending reset for this email', code: 'OTP_NOT_FOUND' }, { status: 400 });
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

  return NextResponse.json({ message: 'Password updated. Please sign in with your new password.' });
}
