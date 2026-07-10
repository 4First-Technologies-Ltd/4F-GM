import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: auth.sub },
    include: { documents: true, listings: true }
  });

  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
