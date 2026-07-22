import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;

    const vendors = await prisma.vendorProfile.findMany({
      where: status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        documents: true,
        _count: { select: { listings: true, orders: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ vendors });
  })
);

const patchSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED'])
});

router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const vendor = await prisma.vendorProfile.findUnique({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const updated = await prisma.vendorProfile.update({
      where: { id },
      data: { status: result.data.status }
    });

    return res.json({ vendor: updated });
  })
);

export default router;
