import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { requireAuth } from '@/lib/server/auth';
import { listingSchema } from '@/lib/server/vendorSchemas';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const result = listingSchema.partial().safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const { id } = await params;

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
  if (!exists) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const listing = await prisma.gasListing.update({ where: { id }, data: result.data });
  return NextResponse.json({ listing });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const profile = await prisma.vendorProfile.findUnique({ where: { userId: auth.sub } });
  if (!profile) {
    return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });
  }

  const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
  if (!exists) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  await prisma.gasListing.delete({ where: { id } });
  return NextResponse.json({ message: 'Listing deleted' });
}
