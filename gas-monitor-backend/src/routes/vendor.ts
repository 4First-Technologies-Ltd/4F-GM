import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { VendorPlan } from '@prisma/client';
import { listingSchema } from '../lib/vendorSchemas';
import { asyncHandler } from '../lib/asyncHandler';
import {
  cooldownExpiry,
  daysRemaining,
  DEFAULT_PLAN,
  isLocked,
  isOfferedPlan,
  PLANS
} from '../lib/plans';

const router = Router();

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({
      where: { userId: req.user!.sub },
      include: {
        documents: true,
        listings: true,
        planChanges: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    return res.json({ profile });
  })
);

const profileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  businessAddress: z.string().min(1, 'Business address is required'),
  // Optional for older mobile clients; the web sign-up always sends both.
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().min(1, 'Phone number is required'),
  // One plan is on sale, so sign-up no longer asks: the rate is disclosed in
  // the form and the server stamps it. Still accepted from clients that send
  // it, as long as it is a plan currently offered.
  plan: z
    .nativeEnum(VendorPlan)
    .refine(isOfferedPlan, { message: 'That partner plan is not available' })
    .optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.post(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { plan, ...details } = result.data;

    const profile = await prisma.vendorProfile.upsert({
      where: { userId: req.user!.sub },
      create: { userId: req.user!.sub, plan: plan ?? DEFAULT_PLAN, ...details },
      // Re-posting the profile must not become a back door around the plan
      // cooldown — switching plans goes through PATCH /plan only.
      update: details
    });

    return res.status(201).json({ profile });
  })
);

// Deliberately no `plan` key: zod strips unknown fields, so a plan smuggled
// into a profile update is dropped rather than applied. Use PATCH /plan.
const patchSchema = z.object({
  businessName: z.string().min(1).optional(),
  businessAddress: z.string().min(1).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().min(1).optional(),
  bio: z.string().max(500).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const profile = await prisma.vendorProfile.update({
      where: { userId: req.user!.sub },
      data: result.data
    });

    return res.json({ profile });
  })
);

const planSchema = z.object({
  plan: z
    .nativeEnum(VendorPlan, {
      errorMap: () => ({ message: 'Choose a partner plan' })
    })
    .refine(isOfferedPlan, { message: 'That partner plan is not available' })
});

/**
 * Switch partner plan. The new plan applies immediately and locks the vendor
 * out of switching again for the cooldown window — see `lib/plans.ts`. Only
 * plans still on sale can be chosen here: a vendor left on a retired plan can
 * move off it, but not back onto one.
 */
router.patch(
  '/plan',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = planSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const existing = await prisma.vendorProfile.findUnique({
      where: { userId: req.user!.sub }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const { plan } = result.data;

    if (plan === existing.plan) {
      return res.status(400).json({ error: `You are already on the ${PLANS[plan].name} plan` });
    }

    if (isLocked(existing.planLockedUntil)) {
      const days = daysRemaining(existing.planLockedUntil!);
      return res.status(409).json({
        error: `You can change plan again in ${days} day${days === 1 ? '' : 's'}`,
        code: 'PLAN_LOCKED',
        planLockedUntil: existing.planLockedUntil
      });
    }

    const now = new Date();
    // The profile update and its history row move together: a switch that is
    // not recorded would leave the commercial trail with a hole in it.
    // History row first, so the profile read below already includes it and the
    // client gets the same shape GET /me returns.
    const [, profile] = await prisma.$transaction([
      prisma.vendorPlanChange.create({
        data: {
          vendorId: existing.id,
          fromPlan: existing.plan,
          toPlan: plan,
          actor: 'VENDOR',
          createdAt: now
        }
      }),
      prisma.vendorProfile.update({
        where: { userId: req.user!.sub },
        data: { plan, planChangedAt: now, planLockedUntil: cooldownExpiry(now) },
        include: { planChanges: { orderBy: { createdAt: 'desc' }, take: 10 } }
      })
    ]);

    return res.json({ profile });
  })
);

const documentSchema = z.object({
  documents: z
    .array(
      z.object({
        url: z.string().min(1),
        fileName: z.string().min(1)
      })
    )
    .min(1)
});

router.post(
  '/documents',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = documentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found. Create profile first.' });
    }

    const count = await prisma.vendorDocument.createMany({
      data: result.data.documents.map((d) => ({ vendorId: profile.id, ...d }))
    });

    return res.status(201).json({ count: count.count });
  })
);

router.get(
  '/listings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const listings = await prisma.gasListing.findMany({
      where: { vendorId: profile.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ listings });
  })
);

router.post(
  '/listings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    if (profile.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Vendor account must be approved to create listings' });
    }

    const listing = await prisma.gasListing.create({
      data: { ...result.data, vendorId: profile.id }
    });

    return res.status(201).json({ listing });
  })
);

router.patch(
  '/listings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingSchema.partial().safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = await prisma.gasListing.update({ where: { id }, data: result.data });
    return res.json({ listing });
  })
);

router.delete(
  '/listings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.gasListing.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    await prisma.gasListing.delete({ where: { id } });
    return res.json({ message: 'Listing deleted' });
  })
);

router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const orders = await prisma.order.findMany({
      where: { vendorId: profile.id },
      include: {
        consumer: { select: { id: true, name: true, email: true } },
        listing: true,
        rider: { select: { id: true, phone: true, user: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ orders });
  })
);

const orderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'])
});

router.patch(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = orderStatusSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const exists = await prisma.order.findFirst({ where: { id, vendorId: profile.id } });
    if (!exists) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = await prisma.order.update({ where: { id }, data: { status: result.data.status } });
    return res.json({ order });
  })
);

const assignRiderSchema = z.object({
  // null unassigns — a vendor pulling a rider off an order without picking a
  // replacement yet.
  riderId: z.string().min(1).nullable()
});

router.patch(
  '/orders/:id/rider',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = assignRiderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message });
    }

    const { id } = req.params;
    const { riderId } = result.data;

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const order = await prisma.order.findFirst({ where: { id, vendorId: profile.id } });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (riderId) {
      const rider = await prisma.riderProfile.findUnique({ where: { id: riderId } });
      if (!rider || rider.status !== 'APPROVED') {
        return res.status(400).json({ error: 'Rider not found or not approved' });
      }
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { riderId, assignedAt: riderId ? new Date() : null }
    });

    return res.json({ order: updated });
  })
);

/** Approved riders available to assign — every vendor draws from the same pool. */
router.get(
  '/riders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const riders = await prisma.riderProfile.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, phone: true, vehicleType: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ riders });
  })
);

export default router;
