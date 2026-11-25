import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { recordEarningSafe } from '../lib/earnings';
import { claimFleetInvite, effectiveRiderStatus } from '../lib/fleet';
import type { Prisma } from '@prisma/client';
import { getOrCreateSettings } from '../lib/settings';
import { safeEqual } from '../lib/security';
import {
  PIN_LOCK_MS,
  PIN_MAX_ATTEMPTS,
  POOL_WHERE,
  RIDER_ACTIVE_STATUSES,
  haversineKm,
  hidePin,
  notifyUsers,
  riderPayFor,
  shortId
} from '../lib/dispatch';

const router = Router();

/**
 * Order routes are only for approved riders. Profile routes stay open to any
 * rider (a new rider has to create their profile before they can be approved).
 * Sends the error response itself and returns null when the rider may not proceed.
 */
async function loadApprovedRider(req: Request, res: Response) {
  const profile = await prisma.riderProfile.findUnique({
    where: { userId: req.user!.sub },
    include: { company: { select: { status: true } } }
  });
  if (!profile) {
    res.status(404).json({ error: 'Rider profile not found' });
    return null;
  }
  // Effective, not stored: a rider approved through a company stops being able
  // to work the moment that company is no longer APPROVED.
  if (effectiveRiderStatus(profile) !== 'APPROVED') {
    res.status(403).json({ error: 'Your rider account has not been approved yet', code: 'RIDER_NOT_APPROVED' });
    return null;
  }
  return profile;
}

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const mine = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!mine) {
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { id: true, email: true, emailVerified: true } });
    if (user) await claimFleetInvite(user);

    const profile = await prisma.riderProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { company: { select: { companyName: true, status: true } } }
    });
    return res.json({ profile });
  })
);

// The rider's delivery pay: their share of each delivered order's delivery fee.
router.get(
  '/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
    if (!profile) return res.status(404).json({ error: 'Rider profile not found' });
    const rows = await prisma.riderEarning.findMany({
      where: { riderId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, amount: true, status: true, failureReason: true, paidAt: true, createdAt: true, orderId: true }
    });
    const sum = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((t, r) => t + r.amount, 0);
    return res.json({
      earnings: rows,
      totals: { paid: sum(['PAID']), pending: sum(['PENDING', 'PROCESSING', 'FAILED']) }
    });
  })
);

const profileSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  vehicleType: z.string().trim().min(1).max(40).optional(),
  plateNumber: z.string().trim().min(1).max(20).optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.post(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const profile = await prisma.riderProfile.upsert({
      where: { userId: req.user!.sub },
      create: { userId: req.user!.sub, ...result.data },
      update: result.data
    });

    // Signing up after being invited: join the fleet now rather than on the next check.
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { id: true, email: true, emailVerified: true } });
    if (user) await claimFleetInvite(user);

    return res.status(201).json({ profile: await prisma.riderProfile.findUnique({ where: { id: profile.id } }) });
  })
);

const patchSchema = profileSchema.partial();

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const existing = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      return res.status(404).json({ error: 'Rider profile not found' });
    }

    const profile = await prisma.riderProfile.update({
      where: { userId: req.user!.sub },
      data: result.data
    });

    return res.json({ profile });
  })
);

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    // A rider awaiting approval still gets the full app; they just have no deliveries
    // (only approved riders can take jobs). Updating a delivery still needs approval.
    const mine = await prisma.riderProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { company: { select: { status: true } } }
    });
    if (!mine) return res.status(404).json({ error: 'Rider profile not found' });
    if (effectiveRiderStatus(mine) !== 'APPROVED') return res.json({ orders: [] });
    const profile = mine;

    const orders = await prisma.order.findMany({
      where: { riderId: profile.id },
      include: {
        consumer: { select: { id: true, name: true, email: true, phone: true } },
        vendor: { select: { id: true, businessName: true, businessAddress: true, phone: true } },
        branch: { select: { id: true, name: true, address: true, phone: true, lat: true, lng: true } }
      },
      orderBy: { assignedAt: 'desc' }
    });

    // Never the PIN: the rider gets it from the customer at the door.
    return res.json({ orders: orders.map(hidePin) });
  })
);

const coordsShape = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
};
const onlineSchema = z.object({ online: z.boolean(), lat: coordsShape.lat.optional(), lng: coordsShape.lng.optional() });

// Online riders see the job pool and get job alerts. Only approved riders may go online.
router.patch(
  '/online',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = onlineSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const { online, lat, lng } = result.data;

    let profileId: string;
    if (online) {
      const approved = await loadApprovedRider(req, res);
      if (!approved) return;
      profileId = approved.id;
    } else {
      const existing = await prisma.riderProfile.findUnique({ where: { userId: req.user!.sub }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: 'Rider profile not found' });
      profileId = existing.id;
    }

    const updated = await prisma.riderProfile.update({
      where: { id: profileId },
      data: { isOnline: online, lastSeenAt: new Date(), ...(lat != null && lng != null ? { lat, lng } : {}) },
      select: { isOnline: true, lastSeenAt: true }
    });
    return res.json(updated);
  })
);

// Where the rider is, so the pool can show distances and alerts go to riders nearby.
router.patch(
  '/location',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = z.object(coordsShape).safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.issues[0].message });
    const { count } = await prisma.riderProfile.updateMany({
      where: { userId: req.user!.sub },
      data: { ...result.data, lastSeenAt: new Date() }
    });
    if (count === 0) return res.status(404).json({ error: 'Rider profile not found' });
    return res.json({ ok: true });
  })
);

/** One account can be a customer, vendor and rider: never offer a rider their own order or their own business's. */
const notOwn = (userId: string): Prisma.OrderWhereInput => ({
  consumerId: { not: userId },
  OR: [{ vendorId: null }, { vendor: { userId: { not: userId } } }]
});

/**
 * The job pool: accepted orders no rider has taken, oldest first. The
 * customer's name and phone are not shown until the rider takes the job.
 */
router.get(
  '/jobs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.riderProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { company: { select: { status: true } } }
    });
    if (!profile) return res.status(404).json({ error: 'Rider profile not found' });

    const approved = effectiveRiderStatus(profile) === 'APPROVED';
    const activeJob = approved
      ? await prisma.order.findFirst({
          where: { riderId: profile.id, status: { in: RIDER_ACTIVE_STATUSES } },
          select: { id: true, status: true }
        })
      : null;
    const base = { online: profile.isOnline, approved, activeJob };
    if (!approved || !profile.isOnline) return res.json({ ...base, jobs: [] });

    await prisma.riderProfile.update({ where: { id: profile.id }, data: { lastSeenAt: new Date() } });

    const [orders, settings] = await Promise.all([
      prisma.order.findMany({
        where: { ...POOL_WHERE, ...notOwn(req.user!.sub) },
        select: {
          id: true,
          supplierName: true,
          cylinderSize: true,
          quantity: true,
          deliveryAddress: true,
          deliveryFee: true,
          poolEnteredAt: true,
          createdAt: true,
          vendor: { select: { businessName: true, businessAddress: true } },
          branch: { select: { name: true, address: true, city: true, lat: true, lng: true } }
        },
        orderBy: [{ poolEnteredAt: 'asc' }, { createdAt: 'asc' }],
        take: 100
      }),
      getOrCreateSettings()
    ]);

    const here = profile.lat != null && profile.lng != null ? { lat: profile.lat, lng: profile.lng } : null;
    const jobs = orders.map((o) => {
      const pickup = o.branch?.lat != null && o.branch?.lng != null ? { lat: o.branch.lat, lng: o.branch.lng } : null;
      return {
        id: o.id,
        ref: shortId(o.id),
        vendorName: o.vendor?.businessName ?? o.supplierName ?? '4FG',
        branchName: o.branch?.name ?? null,
        pickupAddress: o.branch?.address ?? o.vendor?.businessAddress ?? settings.platformPickupAddress,
        pickupCity: o.branch?.city ?? null,
        pickupLat: pickup?.lat ?? null,
        pickupLng: pickup?.lng ?? null,
        deliveryAddress: o.deliveryAddress,
        cylinderSize: o.cylinderSize,
        quantity: o.quantity,
        riderPay: riderPayFor(o.deliveryFee, settings.riderSharePercent),
        distanceKm: here && pickup ? Math.round(haversineKm(here, pickup) * 10) / 10 : null,
        waitingSince: o.poolEnteredAt ?? o.createdAt
      };
    });

    return res.json({ ...base, jobs });
  })
);

/**
 * Take a job from the pool. One job at a time. The rider row is locked first so
 * two quick taps on different jobs can't both land, and the claim itself is a
 * compare-and-set on `riderId: null`, so of two riders tapping the same job only
 * the first gets it.
 */
router.post(
  '/jobs/:id/accept',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadApprovedRider(req, res);
    if (!profile) return;
    if (!profile.isOnline) {
      return res.status(409).json({ error: 'Go online to take jobs', code: 'GO_ONLINE' });
    }

    const id = req.params.id;
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rider_profiles WHERE id = ${profile.id} FOR UPDATE`;
      const busy = await tx.order.count({ where: { riderId: profile.id, status: { in: RIDER_ACTIVE_STATUSES } } });
      if (busy > 0) return 'BUSY' as const;
      const { count } = await tx.order.updateMany({
        where: { id, ...POOL_WHERE, ...notOwn(req.user!.sub) },
        data: { riderId: profile.id, assignedAt: new Date() }
      });
      return count > 0 ? ('CLAIMED' as const) : ('GONE' as const);
    });

    if (outcome === 'BUSY') {
      return res.status(409).json({ error: 'Finish your current delivery before taking another job', code: 'HAS_ACTIVE_JOB' });
    }
    if (outcome === 'GONE') {
      return res.status(409).json({ error: 'This job has already been taken', code: 'JOB_TAKEN' });
    }

    const order = (await prisma.order.findUnique({
      where: { id },
      include: {
        consumer: { select: { id: true, name: true, phone: true } },
        vendor: { select: { businessName: true, businessAddress: true, phone: true } },
        branch: { select: { name: true, address: true, phone: true, lat: true, lng: true } }
      }
    }))!;
    const me = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { name: true } });
    await notifyUsers(
      [order.consumerId],
      'Rider on the way',
      `${me?.name ?? 'A rider'} is collecting order ${shortId(order.id)} and will bring it to you.`,
      order.id
    );
    return res.json({ order: hidePin(order) });
  })
);

// Give a job back before pickup (breakdown, wrong area). It goes straight back into the pool.
router.post(
  '/jobs/:id/release',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await loadApprovedRider(req, res);
    if (!profile) return;
    const { count } = await prisma.order.updateMany({
      where: { id: req.params.id, riderId: profile.id, status: 'ACCEPTED' },
      data: { riderId: null, assignedAt: null, poolEnteredAt: new Date() }
    });
    if (count === 0) {
      return res.status(409).json({ error: 'Only a job you have not picked up yet can be given back', code: 'CANNOT_RELEASE' });
    }
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, select: { id: true, consumerId: true } });
    if (order) {
      await notifyUsers(
        [order.consumerId],
        'Finding another rider',
        `The rider for order ${shortId(order.id)} couldn't make it. We're finding you another one.`,
        order.id
      );
    }
    return res.json({ ok: true });
  })
);

// A rider only moves their own job forward: ACCEPTED → OUT_FOR_DELIVERY (picked
// up) → DELIVERED, which needs the PIN the customer gives them at the door.
const orderStatusSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
  pin: z.string().trim().regex(/^\d{4}$/, 'The PIN is 4 digits').optional()
});

const REQUIRED_CURRENT_STATUS = {
  OUT_FOR_DELIVERY: 'ACCEPTED',
  DELIVERED: 'OUT_FOR_DELIVERY'
} as const;

const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

router.patch(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = orderStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { id } = req.params;
    const profile = await loadApprovedRider(req, res);
    if (!profile) return;

    const target = result.data.status;
    const order = await prisma.order.findFirst({
      where: { id, riderId: profile.id },
      select: { id: true, status: true, consumerId: true, deliveryPin: true, pinLockedUntil: true }
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== REQUIRED_CURRENT_STATUS[target]) {
      return res.status(409).json({
        error: `This order can't be marked ${label(target)} while it is ${label(order.status)}`,
        code: 'INVALID_STATUS_TRANSITION'
      });
    }

    const now = new Date();
    if (target === 'DELIVERED' && order.deliveryPin) {
      if (order.pinLockedUntil && order.pinLockedUntil > now) {
        const mins = Math.ceil((order.pinLockedUntil.getTime() - now.getTime()) / 60_000);
        return res.status(429).json({ error: `Too many wrong PINs. Try again in ${mins} min, or contact support.`, code: 'PIN_LOCKED' });
      }
      const pin = result.data.pin;
      if (!pin) {
        return res.status(400).json({ error: "Enter the customer's delivery PIN to complete the delivery", code: 'PIN_REQUIRED' });
      }
      if (!safeEqual(pin, order.deliveryPin)) {
        const { pinAttempts } = await prisma.order.update({
          where: { id },
          data: { pinAttempts: { increment: 1 } },
          select: { pinAttempts: true }
        });
        if (pinAttempts >= PIN_MAX_ATTEMPTS) {
          await prisma.order.update({ where: { id }, data: { pinAttempts: 0, pinLockedUntil: new Date(now.getTime() + PIN_LOCK_MS) } });
          return res.status(429).json({
            error: `Too many wrong PINs. Try again in ${PIN_LOCK_MS / 60_000} min, or contact support.`,
            code: 'PIN_LOCKED'
          });
        }
        return res.status(400).json({
          error: `That PIN is not right. ${PIN_MAX_ATTEMPTS - pinAttempts} tries left.`,
          code: 'WRONG_PIN',
          attemptsLeft: PIN_MAX_ATTEMPTS - pinAttempts
        });
      }
    }

    // Compare-and-set so two quick taps (or an admin reassigning at the same moment) can't both apply.
    const { count } = await prisma.order.updateMany({
      where: { id, riderId: profile.id, status: REQUIRED_CURRENT_STATUS[target] },
      data:
        target === 'DELIVERED'
          ? { status: target, deliveredAt: now, pinAttempts: 0, pinLockedUntil: null }
          : { status: target, pickedUpAt: now }
    });
    if (count === 0) {
      return res.status(409).json({ error: 'This delivery just changed. Refresh and try again', code: 'STALE' });
    }

    const ref = shortId(id);
    if (target === 'DELIVERED') {
      recordEarningSafe(id);
      await notifyUsers([order.consumerId], 'Delivered', `Order ${ref} has been delivered. Thank you for using 4FG.`, id);
    } else {
      await notifyUsers(
        [order.consumerId],
        'Your gas is on the way',
        `The rider has collected order ${ref}.${order.deliveryPin ? ` Have your PIN ready: ${order.deliveryPin}.` : ''}`,
        id
      );
    }

    const updated = await prisma.order.findUnique({ where: { id } });
    return res.json({ order: updated && hidePin(updated) });
  })
);

export default router;
