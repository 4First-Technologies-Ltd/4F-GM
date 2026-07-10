import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { issueOtp, devOtp } from '@/lib/server/auth';

export const runtime = 'nodejs';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address')
});

export async function POST(req: Request) {
  const result = forgotPasswordSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { email } = result.data;
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = { message: 'If an account exists for that email, a code has been sent.' };

  if (!user) {
    return NextResponse.json(generic);
  }

  const otp = await issueOtp(user.id, user.email, 'PASSWORD_RESET');
  return NextResponse.json({ ...generic, ...devOtp(otp) });
}
