import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { recordEarningSafe } from '../lib/earnings';
import { ASSIGNABLE_RIDER } from '../lib/fleet';
import { canManagerMove, claimInvites, managedBranchIds } from '../lib/staff';

/**
 * Branch-manager API at /api/staff. A manager runs orders and stock for the
 * branches they were invited to, and nothing else: no earnings, documents,
 * plan, profile or branch management. Every query is scoped to the branch ids
 * resolved from `branch_staff` — a branch or order id from the client is only
 * ever used to narrow within that set.
 */
const router = Router();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      managerBranchIds?: string[];
    }
  }
}

async function requireManager(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, email: true, role: true, emailVerified: true, isSuspended: true }
  });
  if (!user || user.role !== 'BRANCH_MANAGER' || !user.emailVerified || user.isSuspended) {
    return res.status(403).json({ error: 'Branch manager access required' });
  }
  // Claiming here means a manager who signed up before being invited gets
  // access on their next request, with no separate "accept" step.
  await claimInvites(user);
  req.managerBranchIds = await managedBranchIds(user.id);
  next();
}

router.use(requireAuth, (req, res, next) => {
  requireManager(req, res, next).catch(next);
});

/** The requested branch if the manager staffs it, else undefined (→ 404). */
function scope(req: Request, branchId: unknown): string[] | undefined {
  const allowed = req.managerBranchIds ?? [];
  if (typeof branchId !== 'string' || !branchId) return allowed;
  return allowed.includes(branchId) ? [branchId] : undefined;
}

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const branches = await prisma.branch.findMany({
      where: { id: { in: req.managerBranchIds ?? [] } },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        phone: true,
        isActive: true,
        suspendedAt: true,
        vendor: { select: { businessName: true } }
      },
      orderBy: { name: 'asc' }
    });
    return res.json({ branches });
  })
);

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const branchIds = scope(req, req.query.branchId);
    if (!branchIds) return res.status(404).json({ error: 'Branch not found' });

    const orders = await prisma.order.findMany({
      where: { branchId: { in: branchIds } },
      include: {
        // Name and phone are what delivery needs; email stays with the vendor.
        consumer: { select: { id: true, name: true, phone: true } },
        listing: { select: { id: true, gasType: true, customName: true } },
        rider: { select: { id: true, phone: true, user: { select: { name: true } } } },
        branch: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    return res.json({ orders });
  })
);

const statusSchema = z.object({ status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) });

router.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const result = statusSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, branchId: { in: req.managerBranchIds ?? [] } }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status } = result.data;
    if (!canManagerMove(order.status, status)) {
      return res.status(409).json({
        error: `An order that is ${order.status.toLowerCase().replace(/_/g, ' ')} cannot be moved to ${status.toLowerCase().replace(/_/g, ' ')}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    // Compare-and-set on the status we checked, so two managers (or a manager
    // and the rider) acting at once cannot both apply a stale transition.
    const updated = await prisma.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status }
    });
    if (updated.count === 0) {
      return res.status(409).json({ error: 'This order was just updated. Refresh and try again', code: 'STALE' });
    }
    if (status === 'DELIVERED') recordEarningSafe(order.id);
    return res.json({ order: await prisma.order.findUnique({ where: { id: order.id } }) });
  })
);

const riderSchema = z.object({ riderId: z.string().min(1).nullable() });

router.patch(
  '/orders/:id/rider',
  asyncHandler(async (req, res) => {
    const result = riderSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, branchId: { in: req.managerBranchIds ?? [] } }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { riderId } = result.data;
    if (riderId) {
      const rider = await prisma.riderProfile.findFirst({ where: { id: riderId, ...ASSIGNABLE_RIDER } });
      if (!rider) {
        return res.status(400).json({ error: 'Rider not found or not approved' });
      }
    }

    // Like the vendor route, this only ever touches riderId/assignedAt.
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { riderId, assignedAt: riderId ? new Date() : null }
    });
    return res.json({ order: updated });
  })
);

router.get(
  '/riders',
  asyncHandler(async (_req, res) => {
    const riders = await prisma.riderProfile.findMany({
      where: ASSIGNABLE_RIDER,
      select: {
        id: true,
        phone: true,
        vehicleType: true,
        user: { select: { name: true } },
        company: { select: { companyName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ riders });
  })
);

router.get(
  '/listings',
  asyncHandler(async (req, res) => {
    const branchIds = scope(req, req.query.branchId);
    if (!branchIds) return res.status(404).json({ error: 'Branch not found' });

    const listings = await prisma.gasListing.findMany({
      where: { branchId: { in: branchIds } },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ listings });
  })
);

// Stock only. Price, sizes and which branch a listing belongs to stay with the
// vendor owner.
const stockSchema = z.object({ inStock: z.boolean() });

router.patch(
  '/listings/:id',
  asyncHandler(async (req, res) => {
    const result = stockSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });

    const listing = await prisma.gasListing.findFirst({
      where: { id: req.params.id, branchId: { in: req.managerBranchIds ?? [] } }
    });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const updated = await prisma.gasListing.update({
      where: { id: listing.id },
      data: { inStock: result.data.inStock }
    });
    return res.json({ listing: updated });
  })
);

export default router;
