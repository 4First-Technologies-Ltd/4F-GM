import { Router } from 'express';
import { Prisma, VendorStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';

const router = Router();

const SORTABLE = ['createdAt', 'businessName', 'status'] as const;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, email: true, createdAt: true } },
  documents: true,
  _count: { select: { listings: true, orders: true } }
} as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const status = req.query.status;

    const where: Prisma.VendorProfileWhereInput = {};
    if (typeof status === 'string' && status in VendorStatus) {
      where.status = status as VendorStatus;
    }
    if (query.q) {
      where.OR = [
        { businessName: { contains: query.q, mode: 'insensitive' } },
        { businessAddress: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
        { user: { email: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [vendors, total] = await Promise.all([
      prisma.vendorProfile.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: orderBy(query, SORTABLE, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.vendorProfile.count({ where })
    ]);

    return res.json(paginated(vendors, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: req.params.id },
      include: LIST_INCLUDE
    });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    return res.json({ vendor });
  })
);

const patchSchema = z.object({
  status: z.nativeEnum(VendorStatus)
});

const AUDIT_ACTION = {
  APPROVED: 'VENDOR_APPROVED',
  REJECTED: 'VENDOR_REJECTED',
  PENDING: 'VENDOR_STATUS_RESET'
} as const;

router.patch(
  '/:id',
  // Approving a vendor lets them trade on the platform — an OPERATIONS-level
  // decision, not something a SUPPORT admin should be able to make.
  requireOperations,
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

    const { status } = result.data;
    const updated = await prisma.vendorProfile.update({ where: { id }, data: { status } });

    await writeAuditLog(req, {
      action: AUDIT_ACTION[status],
      resource: 'vendor',
      resourceId: id,
      summary: `${vendor.businessName}: ${vendor.status} → ${status}`,
      metadata: { from: vendor.status, to: status, businessName: vendor.businessName }
    });

    return res.json({ vendor: updated });
  })
);

export default router;
