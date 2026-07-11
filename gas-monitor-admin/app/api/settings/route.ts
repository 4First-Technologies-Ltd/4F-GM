import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

async function getOrCreateSettings() {
  return prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });
}

export async function GET(req: Request) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const settings = await getOrCreateSettings();
  return NextResponse.json({ settings });
}

const patchSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  allowVendorSignups: z.boolean().optional(),
  supportEmail: z.string().email().nullable().optional(),
  platformFeePercent: z.number().min(0).max(100).optional()
});

export async function PATCH(req: Request) {
  const session = getAdminSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'OPERATIONS') {
    return NextResponse.json({ error: 'You do not have permission to edit platform settings' }, { status: 403 });
  }

  const result = patchSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
  }

  await getOrCreateSettings();
  const settings = await prisma.platformSettings.update({
    where: { id: 'singleton' },
    data: result.data
  });

  return NextResponse.json({ settings });
}
