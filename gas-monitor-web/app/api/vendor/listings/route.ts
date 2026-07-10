import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { listingSchema } from '@/lib/server/vendorSchemas';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const listings = await prisma.gasListing.findMany({
    where: { vendorId: profile.id },
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({ listings });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = listingSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  if (profile.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Vendor account must be approved to create listings' }, { status: 403 });
  }

  const listing = await prisma.gasListing.create({
    data: { ...result.data, vendorId: profile.id }
  });

  return NextResponse.json({ listing }, { status: 201 });
}
