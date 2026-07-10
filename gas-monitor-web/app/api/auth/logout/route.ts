import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { refreshToken } = (await req.json().catch(() => ({}))) as { refreshToken?: string };

  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  return NextResponse.json({ message: 'Logged out successfully' });
}
