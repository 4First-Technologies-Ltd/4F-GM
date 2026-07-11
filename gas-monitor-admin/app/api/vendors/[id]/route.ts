import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const patchSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED'])
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(req);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  const vendor = await prisma.vendorProfile.findUnique({ where: { id } });
  if (!vendor) {
    return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
  }

  const updated = await prisma.vendorProfile.update({
    where: { id },
    data: { status: result.data.status }
  });

  return NextResponse.json({ vendor: updated });
}
