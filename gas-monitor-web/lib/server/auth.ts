import { NextResponse } from 'next/server';
import { prisma } from './prisma';
import { signAccessToken, signRefreshToken, verifyAccessToken, refreshTokenExpiresAt, AccessTokenPayload } from './jwt';
import { generateOtp, hashOtp, otpExpiresAt } from './otp';
import { sendOtpEmail } from './email';

export async function requireAuth(req: Request): Promise<AccessTokenPayload | NextResponse> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing or malformed Authorization header' }, { status: 401 });
  }

  const token = authHeader.slice(7);

  try {
    return verifyAccessToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired access token' }, { status: 401 });
  }
}

export async function issueTokenPair(userId: string, email: string) {
  const accessToken = signAccessToken({ sub: userId, email });
  const rawRefresh = signRefreshToken({ sub: userId });

  await prisma.refreshToken.create({
    data: {
      token: rawRefresh,
      userId,
      expiresAt: refreshTokenExpiresAt()
    }
  });

  return { accessToken, refreshToken: rawRefresh };
}

export async function issueOtp(userId: string, email: string, purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET') {
  const otp = generateOtp();
  await prisma.user.update({
    where: { id: userId },
    data: {
      otpCodeHash: hashOtp(otp),
      otpPurpose: purpose,
      otpExpiresAt: otpExpiresAt(),
      otpAttempts: 0
    }
  });
  await sendOtpEmail(email, otp, purpose);
  return otp;
}

export function devOtp(otp: string): { otp?: string } {
  return process.env.NODE_ENV !== 'production' ? { otp } : {};
}
