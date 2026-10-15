import { NextFunction, Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { fleetInviteExpiry, MAX_FLEET_SIZE, removeFromFleet } from '../lib/fleet';

/**
 * Logistics-company API at /api/company. A company owns a fleet of riders:
 * it invites them by email, sees their deliveries and can remove them. It does
 * NOT assign orders — vendors and admins still assign individual riders, who
 * are labelled with their company. Every fleet query is scoped to this
 * company's id, resolved from the signed-in user, never from the request.
 */
const router = Router();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      company?: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; userId: string };
    }
  }
}

async function requireCompanyUser(req: Request, res: Response, next: NextFunction) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { role: true, emailVerified: true, isSuspended: true }
  });
  if (!user || user.role !== 'LOGISTICS_COMPANY' || !user.emailVerified || user.isSuspended) {
    return res.status(403).json({ error: 'Logistics company access required' });
  }
  next();
}

/** For fleet routes: the company must exist and be approved. */
async function requireApprovedCompany(req: Request, res: Response, next: NextFunction) {
  const company = await prisma.logisticsCompany.findUnique({ where: { userId: req.user!.sub } });
  if (!company) return res.status(404).json({ error: 'Company profile not found' });
  if (company.status !== 'APPROVED') {
    return res.status(403).json({
      error: 'Your company has not been approved yet',
      code: 'COMPANY_NOT_APPROVED'
    });
  }
  req.company = { id: company.id, status: company.status, userId: company.userId };
  next();
}

const guard = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

router.use(requireAuth, guard(requireCompanyUser));

// ── Profile (open while PENDING so a new company can finish sign-up) ─────────

const profileSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required').max(120),
  address: z.string().trim().min(1, 'Company address is required').max(250),
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(1, 'Phone number is required').max(30)
});

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const company = await prisma.logisticsCompany.findUnique({ where: { userId: req.user!.sub } });
    if (!company) return res.status(404).json({ error: 'Company profile not found' });
    return res.json({ company });
  })
);

router.post(
  '/profile',
  asyncHandler(async (req, res) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    // `status` is deliberately not settable here: approval is an admin decision.
    const company = await prisma.logisticsCompany.upsert({
      where: { userId: req.user!.sub },
      create: { userId: req.user!.sub, ...result.data },
      update: result.data
    });
    return res.status(201).json({ company });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const result = profileSchema.partial().safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const existing = await prisma.logisticsCompany.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) return res.status(404).json({ error: 'Company profile not found' });

    const company = await prisma.logisticsCompany.update({ where: { id: existing.id }, data: result.data });
    return res.json({ company });
  })
);

// ── Fleet (approved companies only) ──────────────────────────────────────────

router.get(
  '/riders',
  guard(requireApprovedCompany),
  asyncHandler(async (req, res) => {
    const companyId = req.company!.id;
    const [riders, invites] = await Promise.all([
      prisma.riderProfile.findMany({
        where: { companyId },
        select: {
          id: true,
          phone: true,
          vehicleType: true,
          plateNumber: true,
          status: true,
          user: { select: { name: true, email: true } },
          _count: { select: { orders: { where: { status: { in: ['CONFIRMED', 'OUT_FOR_DELIVERY'] } } } } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.fleetInvite.findMany({
        where: { companyId, status: 'INVITED' },
        select: { id: true, email: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
      })
    ]);
    return res.json({
      riders: riders.map(({ _count, ...r }) => ({ ...r, activeOrders: _count.orders })),
      invites
    });
  })
);

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') });

/**
 * Invite a rider by email. They join (and are approved by joining) when a RIDER
 * account with that verified email has a profile. Whether the email already has
 * an account is never revealed.
 */
router.post(
  '/riders/invite',
  guard(requireApprovedCompany),
  asyncHandler(async (req, res) => {
    const result = inviteSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const companyId = req.company!.id;
    const { email } = result.data;

    const existing = await prisma.fleetInvite.findUnique({ where: { companyId_email: { companyId, email } } });
    if (existing?.status === 'ACTIVE') {
      return res.status(409).json({ error: 'That rider is already in your fleet' });
    }

    const live = await prisma.fleetInvite.count({
      where: { companyId, OR: [{ status: 'ACTIVE' }, { status: 'INVITED', expiresAt: { gt: new Date() } }] }
    });
    if (live >= MAX_FLEET_SIZE && existing?.status !== 'INVITED') {
      return res.status(409).json({ error: `A fleet can have up to ${MAX_FLEET_SIZE} riders`, code: 'FLEET_LIMIT' });
    }

    const invite = await prisma.fleetInvite.upsert({
      where: { companyId_email: { companyId, email } },
      create: { companyId, email, expiresAt: fleetInviteExpiry() },
      update: { status: 'INVITED', userId: null, expiresAt: fleetInviteExpiry() },
      select: { id: true, email: true, status: true, expiresAt: true }
    });
    return res.status(201).json({ invite });
  })
);

/** Withdraw a pending invite. */
router.delete(
  '/invites/:id',
  guard(requireApprovedCompany),
  asyncHandler(async (req, res) => {
    const invite = await prisma.fleetInvite.findFirst({
      where: { id: req.params.id, companyId: req.company!.id, status: 'INVITED' }
    });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    await removeFromFleet(req.company!.id, { id: invite.id, userId: null });
    return res.json({ message: 'Invite withdrawn' });
  })
);

/**
 * Remove a rider from the fleet. A rider who was approved only by joining goes
 * back to PENDING; one an admin approved on their own keeps working.
 */
router.delete(
  '/riders/:riderId',
  guard(requireApprovedCompany),
  asyncHandler(async (req, res) => {
    const companyId = req.company!.id;
    const rider = await prisma.riderProfile.findFirst({ where: { id: req.params.riderId, companyId } });
    if (!rider) return res.status(404).json({ error: 'Rider not found in your fleet' });

    const invite = await prisma.fleetInvite.findFirst({
      where: { companyId, userId: rider.userId, status: 'ACTIVE' }
    });
    await removeFromFleet(companyId, { id: invite?.id, userId: rider.userId });
    return res.json({ message: 'Rider removed from your fleet' });
  })
);

/**
 * Deliveries by the fleet's riders. Names and addresses only: a company needs
 * to see what its riders are doing, not customers' email or phone numbers.
 */
router.get(
  '/deliveries',
  guard(requireApprovedCompany),
  asyncHandler(async (req, res) => {
    const orders = await prisma.order.findMany({
      where: { rider: { companyId: req.company!.id } },
      select: {
        id: true,
        status: true,
        cylinderSize: true,
        quantity: true,
        deliveryAddress: true,
        assignedAt: true,
        createdAt: true,
        consumer: { select: { name: true } },
        vendor: { select: { businessName: true } },
        rider: { select: { id: true, user: { select: { name: true } } } }
      },
      orderBy: { assignedAt: 'desc' },
      take: 200
    });
    return res.json({ orders });
  })
);

export default router;
