import { Router } from 'express';
import { z } from 'zod';
import { getAdminSession } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

async function getOrCreateSettings() {
  return prisma.platformSettings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {}
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const session = getAdminSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });

    const settings = await getOrCreateSettings();
    return res.json({ settings });
  })
);

const patchSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  allowVendorSignups: z.boolean().optional(),
  supportEmail: z.string().email().nullable().optional(),
  platformFeePercent: z.number().min(0).max(100).optional()
});

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const session = getAdminSession(req);
    if (!session) return res.status(401).json({ error: 'Not authenticated' });
    if (session.role !== 'SUPER_ADMIN' && session.role !== 'OPERATIONS') {
      return res.status(403).json({ error: 'You do not have permission to edit platform settings' });
    }

    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    await getOrCreateSettings();
    const settings = await prisma.platformSettings.update({
      where: { id: 'singleton' },
      data: result.data
    });

    return res.json({ settings });
  })
);

export default router;
