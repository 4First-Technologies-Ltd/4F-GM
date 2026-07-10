import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/prisma';
import { verifyRefreshToken } from '@/lib/server/jwt';
import { issueTokenPair } from '@/lib/server/auth';

export const runtime = 'nodejs';

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export async function POST(req: Request) {
  const result = refreshSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { refreshToken } = result.data;

  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Refresh token revoked or expired' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true } });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 });
  }

  // Rotate: delete old token, issue new pair
  await prisma.refreshToken.delete({ where: { token: refreshToken } });
  const tokens = await issueTokenPair(user.id, user.email);

  return NextResponse.json(tokens);
}
