import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const patchSchema = z.object({
  inStock: z.boolean()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const listing = await prisma.gasListing.findUnique({ where: { id } });
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const updated = await prisma.gasListing.update({
    where: { id },
    data: { inStock: result.data.inStock }
  });

  return NextResponse.json({ listing: updated });
}
