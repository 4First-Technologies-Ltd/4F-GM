import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { issueOtp, devOtp } from '@/lib/server/auth';

export const runtime = 'nodejs';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['CONSUMER', 'VENDOR']).optional().default('CONSUMER')
});

export async function POST(req: Request) {
  const result = registerSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { name, email, password, role } = result.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.emailVerified) {
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { name, password: hashedPassword, role } })
    : await prisma.user.create({ data: { name, email, password: hashedPassword, role } });

  const otp = await issueOtp(user.id, user.email, 'SIGNUP_VERIFICATION');

  return NextResponse.json(
    {
      message: 'Account created. Enter the code we emailed you to verify your address.',
      email: user.email,
      ...devOtp(otp)
    },
    { status: 201 }
  );
}
