import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      vendorProfile: { select: { status: true } }
    }
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { vendorProfile, ...userData } = user;
  return NextResponse.json({ user: { ...userData, vendorStatus: vendorProfile?.status ?? undefined } });
}
