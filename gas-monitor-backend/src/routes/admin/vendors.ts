import { Router } from 'express';
import { Prisma, VendorPlan, VendorStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { cooldownExpiry, PLANS } from '../../lib/plans';

const router = Router();

const SORTABLE = ['createdAt', 'businessName', 'status', 'plan'] as const;

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
    const plan = req.query.plan;
    if (typeof plan === 'string' && plan in VendorPlan) {
      where.plan = plan as VendorPlan;
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
      // Plan history is only worth loading for one vendor, not a whole page.
      include: {
        ...LIST_INCLUDE,
        planChanges: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
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

const planSchema = z.object({
  plan: z.nativeEnum(VendorPlan)
});

/**
 * Change a vendor's partner plan on their behalf. Unlike the vendor-facing
 * route this ignores the cooldown — an operator correcting a mistake should
 * not have to wait out a lock the vendor triggered.
 */
router.patch(
  '/:id/plan',
  requireOperations,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = planSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const vendor = await prisma.vendorProfile.findUnique({ where: { id } });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const { plan } = result.data;
    if (plan === vendor.plan) {
      return res.status(400).json({ error: `Vendor is already on the ${PLANS[plan].name} plan` });
    }

    const now = new Date();
    const bypassedCooldown = !!vendor.planLockedUntil && vendor.planLockedUntil > now;

    const [updated] = await prisma.$transaction([
      prisma.vendorProfile.update({
        where: { id },
        // An admin change starts a fresh cooldown too, so the vendor cannot
        // immediately undo it.
        data: { plan, planChangedAt: now, planLockedUntil: cooldownExpiry(now) }
      }),
      prisma.vendorPlanChange.create({
        data: {
          vendorId: id,
          fromPlan: vendor.plan,
          toPlan: plan,
          actor: 'ADMIN',
          // Snapshotted, so the entry survives the operator being deleted.
          actorName: req.admin?.name ?? null,
          actorEmail: req.admin?.username ?? null,
          bypassedCooldown,
          createdAt: now
        }
      })
    ]);

    await writeAuditLog(req, {
      action: 'VENDOR_PLAN_CHANGED',
      resource: 'vendor',
      resourceId: id,
      summary: `${vendor.businessName}: plan ${PLANS[vendor.plan].name} → ${PLANS[plan].name}`,
      metadata: {
        from: vendor.plan,
        to: plan,
        businessName: vendor.businessName,
        bypassedCooldown
      }
    });

    return res.json({ vendor: updated });
  })
);

export default router;
