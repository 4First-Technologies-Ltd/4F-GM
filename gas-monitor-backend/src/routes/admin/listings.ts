import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';

const router = Router();

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const listings = await prisma.gasListing.findMany({
      include: {
        vendor: { select: { businessName: true } },
        _count: { select: { orders: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    return res.json({ listings });
  })
);

const patchSchema = z.object({
  inStock: z.boolean()
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

    const listing = await prisma.gasListing.findUnique({ where: { id } });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const updated = await prisma.gasListing.update({
      where: { id },
      data: { inStock: result.data.inStock }
    });

    return res.json({ listing: updated });
  })
);

export default router;
