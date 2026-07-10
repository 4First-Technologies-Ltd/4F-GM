import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { issueOtp, devOtp } from '@/lib/server/auth';

export const runtime = 'nodejs';

const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['SIGNUP_VERIFICATION', 'PASSWORD_RESET'])
});

export async function POST(req: Request) {
  const result = resendOtpSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { email, purpose } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = { message: 'If an account matches, a new code has been sent.' };

  if (!user) {
    return NextResponse.json(generic);
  }
  if (purpose === 'SIGNUP_VERIFICATION' && user.emailVerified) {
    return NextResponse.json(generic);
  }

  const otp = await issueOtp(user.id, user.email, purpose);
  return NextResponse.json({ ...generic, ...devOtp(otp) });
}
