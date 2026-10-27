import { Router } from 'express';
import { Prisma, VendorPlan, VendorStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations, requireSuperAdmin } from '../../middleware/requireAdmin';
import { DeletionBlocked, eraseAccountAsAdmin } from '../../lib/accountDeletion';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { cooldownExpiry, PLANS } from '../../lib/plans';
import { withViewUrls } from '../../lib/storage';
import { OPEN_ORDER_STATUSES } from '../../lib/branches';

const router = Router();

const SORTABLE = ['createdAt', 'businessName', 'status', 'plan'] as const;

const LIST_INCLUDE = {
  user: { select: { id: true, name: true, email: true, createdAt: true, isSuspended: true, suspendedReason: true } },
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

    const signed = await Promise.all(
      vendors.map(async (v) => ({ ...v, documents: await withViewUrls(v.documents) }))
    );
    return res.json(paginated(signed, total, query));
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
        branches: {
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
          include: { staff: { where: { status: { not: 'REVOKED' } }, orderBy: { createdAt: 'asc' } } }
        },
        planChanges: { orderBy: { createdAt: 'desc' }, take: 20 }
      }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    return res.json({ vendor: { ...vendor, documents: await withViewUrls(vendor.documents) } });
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
      return res.status(400).json({ error: result.error.issues[0].message });
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
      return res.status(400).json({ error: result.error.issues[0].message });
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

const vendorSuspendSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason for the suspension').max(300)
});

/**
 * Suspend a vendor's whole account. They cannot sign in, their listings leave the
 * marketplace and they cannot be ordered from. Orders already paid for are left
 * alone (the count is recorded in the audit entry) so customers are not stranded.
 * Reversible with /restore.
 */
router.post(
  '/:id/suspend',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const result = vendorSuspendSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (vendor.user.isSuspended) return res.status(409).json({ error: 'This vendor is already suspended' });

    const openOrders = await prisma.order.count({ where: { vendorId: vendor.id, status: { in: [...OPEN_ORDER_STATUSES] } } });
    await prisma.$transaction([
      prisma.user.update({
        where: { id: vendor.userId },
        data: { isSuspended: true, suspendedReason: result.data.reason, suspendedAt: new Date() }
      }),
      // Ends their sessions: a refresh token is the only thing that keeps a phone signed in.
      prisma.refreshToken.deleteMany({ where: { userId: vendor.userId } })
    ]);

    await writeAuditLog(req, {
      action: 'VENDOR_SUSPENDED',
      resource: 'vendor',
      resourceId: vendor.id,
      summary: `${vendor.businessName} suspended: ${result.data.reason}`,
      metadata: { reason: result.data.reason, openOrdersLeftAlone: openOrders, businessName: vendor.businessName }
    });
    return res.json({ ok: true, openOrders });
  })
);

router.post(
  '/:id/restore',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendorProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (!vendor.user.isSuspended) return res.status(409).json({ error: 'This vendor is not suspended' });
    if (vendor.user.email.endsWith('@deleted.invalid')) {
      return res.status(409).json({ error: 'This vendor was deleted and cannot be restored' });
    }

    await prisma.user.update({
      where: { id: vendor.userId },
      data: { isSuspended: false, suspendedReason: null, suspendedAt: null }
    });
    await writeAuditLog(req, {
      action: 'VENDOR_RESTORED',
      resource: 'vendor',
      resourceId: vendor.id,
      summary: `${vendor.businessName} reinstated`,
      metadata: { businessName: vendor.businessName }
    });
    return res.json({ ok: true });
  })
);

const vendorDeleteSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason for deleting this vendor').max(300),
  /** Must match the business name, so a stray click cannot delete the wrong vendor. */
  confirmName: z.string().trim().min(1, 'Type the business name to confirm')
});

/**
 * Delete a vendor. Orders, earnings and payouts are financial records, so the
 * account is anonymised in place (details, documents, bank details and photos
 * removed, listings out of stock, branches closed, sign-in impossible) rather
 * than dropped. Refused while the vendor has paid orders to deliver or earnings
 * not yet paid out; the reason is returned so the admin knows what to settle first.
 */
router.delete(
  '/:id',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const result = vendorDeleteSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const vendor = await prisma.vendorProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    if (vendor.user.email.endsWith('@deleted.invalid')) {
      return res.status(409).json({ error: 'This vendor has already been deleted' });
    }
    if (result.data.confirmName.toLowerCase() !== vendor.businessName.trim().toLowerCase()) {
      return res.status(400).json({ error: 'The name you typed does not match this vendor' });
    }

    try {
      await eraseAccountAsAdmin(vendor.user);
    } catch (err) {
      if (err instanceof DeletionBlocked) {
        return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
      }
      throw err;
    }

    await writeAuditLog(req, {
      action: 'VENDOR_DELETED',
      resource: 'vendor',
      resourceId: vendor.id,
      summary: `${vendor.businessName} deleted: ${result.data.reason}`,
      metadata: { reason: result.data.reason, businessName: vendor.businessName }
    });
    return res.json({ ok: true });
  })
);

const suspendSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason for the suspension').max(300)
});

/**
 * Suspend one branch without touching the vendor. The vendor can no longer sell
 * from, reopen or promote it until it is restored. Orders already in flight are
 * left alone (the count is recorded in the audit entry) so customers who have
 * paid are not stranded.
 */
router.post(
  '/:id/branches/:branchId/suspend',
  requireOperations,
  asyncHandler(async (req, res) => {
    const result = suspendSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, vendorId: req.params.id },
      include: { vendor: { select: { businessName: true } } }
    });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (branch.suspendedAt) return res.status(409).json({ error: 'Branch is already suspended' });

    const openOrders = await prisma.order.count({
      where: { branchId: branch.id, status: { in: [...OPEN_ORDER_STATUSES] } }
    });
    const updated = await prisma.branch.update({
      where: { id: branch.id },
      data: { suspendedAt: new Date(), suspendedReason: result.data.reason }
    });

    await writeAuditLog(req, {
      action: 'BRANCH_SUSPENDED',
      resource: 'branch',
      resourceId: branch.id,
      summary: `${branch.vendor.businessName} / ${branch.name} suspended`,
      metadata: { vendorId: req.params.id, reason: result.data.reason, openOrders, wasMain: branch.isMain }
    });

    return res.json({ branch: updated, openOrders });
  })
);

router.post(
  '/:id/branches/:branchId/restore',
  requireOperations,
  asyncHandler(async (req, res) => {
    const branch = await prisma.branch.findFirst({
      where: { id: req.params.branchId, vendorId: req.params.id },
      include: { vendor: { select: { businessName: true } } }
    });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });
    if (!branch.suspendedAt) return res.status(409).json({ error: 'Branch is not suspended' });

    const updated = await prisma.branch.update({
      where: { id: branch.id },
      data: { suspendedAt: null, suspendedReason: null }
    });

    await writeAuditLog(req, {
      action: 'BRANCH_RESTORED',
      resource: 'branch',
      resourceId: branch.id,
      summary: `${branch.vendor.businessName} / ${branch.name} restored`,
      metadata: { vendorId: req.params.id, previousReason: branch.suspendedReason }
    });

    return res.json({ branch: updated });
  })
);

export default router;
