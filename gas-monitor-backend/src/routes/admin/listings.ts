import { Router } from 'express';
import { GasType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

const SORTABLE = ['createdAt', 'pricePerKg', 'gasType'] as const;

const LIST_INCLUDE = {
  vendor: { select: { id: true, businessName: true, status: true } },
  _count: { select: { orders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const gasType = req.query.gasType;
    const inStock = req.query.inStock;
    const vendorId = req.query.vendorId;

    const where: Prisma.GasListingWhereInput = {};
    if (typeof gasType === 'string' && gasType in GasType) {
      where.gasType = gasType as GasType;
    }
    if (inStock === 'true' || inStock === 'false') {
      where.inStock = inStock === 'true';
    }
    if (typeof vendorId === 'string' && vendorId) {
      where.vendorId = vendorId;
    }
    if (query.q) {
      where.OR = [
        { customName: { contains: query.q, mode: 'insensitive' } },
        { otherSizes: { contains: query.q, mode: 'insensitive' } },
        { vendor: { businessName: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [listings, total] = await Promise.all([
      prisma.gasListing.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.gasListing.count({ where })
    ]);

    return res.json(paginated(listings, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const listing = await prisma.gasListing.findUnique({
      where: { id: req.params.id },
      include: LIST_INCLUDE
    });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    return res.json({ listing });
  })
);

const patchSchema = z.object({
  inStock: z.boolean()
});

router.patch(
  '/:id',
  // Taking a listing out of stock removes it from the consumer app.
  requireOperations,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const listing = await prisma.gasListing.findUnique({
      where: { id },
      include: { vendor: { select: { businessName: true } } }
    });
    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const { inStock } = result.data;
    const updated = await prisma.gasListing.update({ where: { id }, data: { inStock } });

    const label = listing.customName ?? listing.gasType;
    await writeAuditLog(req, {
      action: 'LISTING_STOCK_UPDATED',
      resource: 'listing',
      resourceId: id,
      summary: `${label} (${listing.vendor.businessName}) marked ${inStock ? 'in stock' : 'out of stock'}`,
      metadata: { from: listing.inStock, to: inStock, vendor: listing.vendor.businessName }
    });

    return res.json({ listing: updated });
  })
);

export default router;
