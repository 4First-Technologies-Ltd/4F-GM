import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { issueTokenPair } from '@/lib/server/auth';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(req: Request) {
  const result = loginSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 400 });
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { vendorProfile: { select: { status: true } } }
  });
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      { error: 'Please verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' },
      { status: 403 }
    );
  }

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
