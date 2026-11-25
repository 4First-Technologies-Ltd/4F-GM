import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { claimInvites, managedBranchIds } from '../lib/staff';
import {
  RIDERS_CHOOSE_JOBS,
  acceptOrder,
  cancelPaidOrder,
  hidePin,
  legacyStatusSchema,
  rejectSchema,
  sendDispatchResult
} from '../lib/dispatch';

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
  if (!user || !user.emailVerified || user.isSuspended) {
    return res.status(403).json({ error: 'Branch manager access required' });
  }
  // Claiming here means anyone invited by their verified email gets access on
  // their next request, with no separate "accept" step.
  await claimInvites(user);
  req.managerBranchIds = await managedBranchIds(user.id);
  // Gated by holding an active branch (or having signed up as a manager, so one whose
  // branches were all revoked still sees an empty list): an account can hold several roles.
  if (req.managerBranchIds.length === 0 && user.role !== 'BRANCH_MANAGER') {
    return res.status(403).json({ error: 'Branch manager access required' });
  }
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
    return res.json({ orders: orders.map(hidePin) });
  })
);

const branchScope = (req: Request) => ({ branchId: { in: req.managerBranchIds ?? [] } });

// Accept puts a paid order into the rider job pool. Managers no longer pick riders.
router.post(
  '/orders/:id/accept',
  asyncHandler(async (req, res) => sendDispatchResult(res, await acceptOrder(req.params.id, branchScope(req))))
);

// Reject cancels a paid order before pickup and opens a refund ticket for the admins.
router.post(
  '/orders/:id/reject',
  asyncHandler(async (req, res) => {
    const result = rejectSchema.safeParse(req.body ?? {});
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    return sendDispatchResult(
      res,
      await cancelPaidOrder(req.params.id, branchScope(req), { by: 'branch manager', reason: result.data.reason })
    );
  })
);

// Old builds move orders with `{ status }`: only CANCELLED (as a reject) is still honoured.
router.patch(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const result = legacyStatusSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    if (result.data.status === 'CANCELLED') {
      return sendDispatchResult(res, await cancelPaidOrder(req.params.id, branchScope(req), { by: 'branch manager' }));
    }
    return res.status(409).json(RIDERS_CHOOSE_JOBS);
  })
);

// Removed: riders now claim accepted orders from the job pool.
router.patch('/orders/:id/rider', (_req, res) => res.status(410).json(RIDERS_CHOOSE_JOBS));
router.get('/riders', (_req, res) => res.status(410).json(RIDERS_CHOOSE_JOBS));

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
