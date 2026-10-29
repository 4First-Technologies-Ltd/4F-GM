import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { Prisma, VendorPlan } from '@prisma/client';
import { listingPatchSchema, listingSchema } from '../lib/vendorSchemas';
import { recordEarningSafe } from '../lib/earnings';
import { ASSIGNABLE_RIDER } from '../lib/fleet';
import { branchSchema, findMainBranch, findOwnBranch, isSellable } from '../lib/branches';
import { asyncHandler } from '../lib/asyncHandler';
import {
  ALLOWED_IMAGE_TYPES,
  deleteImage,
  MAX_IMAGE_BYTES,
  newImageKey,
  presignImageUpload,
  publicImageUrl,
  publicStorageConfigured
} from '../lib/storage';
import { rcNumberSchema } from '../lib/rcNumber';
import { checkOwnImageKey, withImage, withLogo } from '../lib/images';
import { documentUploadLimiter } from '../lib/security';
import {
  cooldownExpiry,
  daysRemaining,
  DEFAULT_PLAN,
  isLocked,
  isOfferedPlan,
  PLANS
} from '../lib/plans';

const router = Router();

const RC_IN_USE = { error: 'That RC number is already registered to another vendor.', code: 'RC_NUMBER_IN_USE' };

/** Runs a profile write and turns the unique-index clash on `rcNumber` into a result instead of a 500. */
async function saveWithRcCheck<T>(write: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await write() };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { ok: false };
    throw err;
  }
}

/**
 * The vendor's own earnings ledger: what each delivered order paid them after the
 * platform's commission (the delivery fee is never part of it), and how it reaches
 * them. SETTLED = the payment gateway sent it to their bank at checkout; AVAILABLE
 * and IN_PAYOUT = still to be paid out by the platform; PAID = already paid out.
 */
router.get(
  '/earnings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({
      where: { userId: req.user!.sub },
      select: { id: true, bankAccount: { select: { bankName: true, accountName: true, accountNumber: true } } }
    });
    if (!profile) return res.status(404).json({ error: 'Vendor profile not found' });

    const [groups, rows] = await Promise.all([
      prisma.earning.groupBy({
        by: ['status'],
        where: { vendorId: profile.id },
        _sum: { netAmount: true, commissionAmount: true },
        _count: true
      }),
      prisma.earning.findMany({
        where: { vendorId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          orderId: true,
          grossAmount: true,
          commissionPercent: true,
          commissionAmount: true,
          netAmount: true,
          status: true,
          createdAt: true,
          order: { select: { cylinderSize: true, quantity: true } }
        }
      })
    ]);

    const net = (...st: string[]) =>
      Math.round(groups.filter((g) => st.includes(g.status)).reduce((t, g) => t + (g._sum.netAmount ?? 0), 0) * 100) / 100;
    const bank = profile.bankAccount;
    return res.json({
      totals: {
        settled: net('SETTLED'),
        paidOut: net('PAID'),
        awaitingPayout: net('AVAILABLE', 'IN_PAYOUT'),
        commission: Math.round(groups.reduce((t, g) => t + (g._sum.commissionAmount ?? 0), 0) * 100) / 100,
        orders: groups.reduce((t, g) => t + g._count, 0)
      },
      payoutAccount: bank
        ? { bankName: bank.bankName, accountName: bank.accountName, last4: bank.accountNumber.slice(-4) }
        : null,
      earnings: rows
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await prisma.vendorProfile.findUnique({
      where: { userId: req.user!.sub },
      include: {
        listings: true,
        branches: { orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] },
        planChanges: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    return res.json({
      profile: {
        ...withLogo(profile),
        listings: profile.listings.map(withImage)
      }
    });
  })
);

const profileSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  businessAddress: z.string().min(1, 'Business address is required'),
  // Optional for older mobile clients; the web sign-up always sends both.
  state: z.string().trim().min(2).max(80).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().min(1, 'Phone number is required'),
  // Optional only so older app builds keep working; admins cannot approve a
  // vendor without one, and every current sign-up form requires it.
  rcNumber: rcNumberSchema.optional(),
  // One plan is on sale, so sign-up no longer asks: the rate is disclosed in
  // the form and the server stamps it. Still accepted from clients that send
  // it, as long as it is a plan currently offered.
  plan: z
    .nativeEnum(VendorPlan)
    .refine(isOfferedPlan, { message: 'That partner plan is not available' })
    .optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Additional branches created at sign-up, besides the main one that is
  // seeded from the business location above.
  branches: z.array(branchSchema).max(19).optional()
});

router.post(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const { plan, branches: extraBranches = [], ...details } = result.data;

    const effectivePlan = plan ?? DEFAULT_PLAN;
    if (1 + extraBranches.length > PLANS[effectivePlan].maxBranches) {
      return res.status(400).json({
        error: `The ${PLANS[effectivePlan].name} plan allows up to ${PLANS[effectivePlan].maxBranches} branches`,
        code: 'BRANCH_LIMIT'
      });
    }

    const saved = await saveWithRcCheck(() =>
      prisma.vendorProfile.upsert({
        where: { userId: req.user!.sub },
        create: { userId: req.user!.sub, plan: plan ?? DEFAULT_PLAN, ...details },
        // Re-posting the profile must not become a back door around the plan
        // cooldown — switching plans goes through PATCH /plan only.
        update: details
      })
    );
    if (!saved.ok) return res.status(409).json(RC_IN_USE);
    const profile = saved.value;

    // Every vendor has a main branch from day one, seeded from the business
    // location. Skipped when one exists so re-posting the profile is harmless.
    if (!(await findMainBranch(profile.id))) {
      await prisma.$transaction([
        prisma.branch.create({
          data: {
            vendorId: profile.id,
            name: 'Main branch',
            address: profile.businessAddress,
            state: profile.state,
            city: profile.city,
            lat: profile.lat,
            lng: profile.lng,
            phone: profile.phone,
            isMain: true
          }
        }),
        ...extraBranches.map(({ openingHours, ...b }) =>
          prisma.branch.create({
            data: { ...b, ...(openingHours ? { openingHours: openingHours as object } : {}), vendorId: profile.id }
          })
        )
      ]);
    }

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
  rcNumber: rcNumberSchema.optional(),
  bio: z.string().max(500).nullable().optional(),
  // R2 key issued by POST /images/upload-url (kind "logo"), or null to remove the logo.
  // There is deliberately no `logoUrl` input any more: clients used to send local file
  // paths and base64 blobs, neither of which other devices can load.
  logoKey: z.string().min(1).nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional()
});

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = patchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const existing = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!existing) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    const { logoKey, ...fields } = result.data;
    if (logoKey) {
      const problem = await checkOwnImageKey('logo', existing.id, logoKey);
      if (problem) return res.status(400).json({ error: problem });
    }

    const saved = await saveWithRcCheck(() =>
      prisma.vendorProfile.update({
        where: { userId: req.user!.sub },
        data: { ...fields, ...(logoKey !== undefined ? { logoUrl: logoKey } : {}) }
      })
    );
    if (!saved.ok) return res.status(409).json(RC_IN_USE);
    const profile = saved.value;
    if (logoKey !== undefined && existing.logoUrl && existing.logoUrl !== logoKey) await deleteImage(existing.logoUrl);

    return res.json({ profile: withLogo(profile) });
  })
);

const planSchema = z.object({
  plan: z
    .nativeEnum(VendorPlan, { error: 'Choose a partner plan' })
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
      return res.status(400).json({ error: result.error.issues[0].message });
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

const imageUploadSchema = z.object({
  kind: z.enum(['logo', 'listing']),
  contentType: z.string(),
  size: z.number().int().positive()
});

/**
 * Marketplace images (business logo, listing photos) go to the public bucket:
 * the app PUTs straight to R2 with this link, then sends the returned `key` as
 * `logoKey` / `imageKey` when saving the profile or listing.
 */
router.post(
  '/images/upload-url',
  requireAuth,
  documentUploadLimiter,
  asyncHandler(async (req, res) => {
    if (!publicStorageConfigured()) {
      return res.status(503).json({ error: 'Image upload is not available right now. Please try again later.' });
    }
    const result = imageUploadSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: 'Invalid image details' });
    const { kind, contentType, size } = result.data;
    if (!ALLOWED_IMAGE_TYPES[contentType]) {
      return res.status(400).json({ error: 'Only JPG, PNG or WebP images are accepted.' });
    }
    if (size > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'Image is too large. The limit is 5 MB.' });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found. Create profile first.' });
    }

    const key = newImageKey(kind, profile.id, contentType);
    const uploadUrl = await presignImageUpload(key, contentType, size);
    return res.json({ key, uploadUrl, publicUrl: publicImageUrl(key), contentType, expiresInSeconds: 300 });
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

    const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
    const listings = await prisma.gasListing.findMany({
      where: { vendorId: profile.id, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ listings: listings.map(withImage) });
  })
);

router.post(
  '/listings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
    }

    const profile = await prisma.vendorProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!profile) {
      return res.status(404).json({ error: 'Vendor profile not found' });
    }

    // PENDING vendors may set up their store: the marketplace only shows listings of APPROVED vendors,
    // so nothing goes live until an admin approves. A rejected vendor cannot add more.
    if (profile.status === 'REJECTED') {
      return res.status(403).json({ error: 'Your vendor application was rejected. Contact support.' });
    }
    if (result.data.cylinderSizes.length === 0 && !result.data.sellsLoose) {
      return res.status(400).json({ error: 'Select at least one cylinder size, or sell loose gas by kg' });
    }

    // Omitted branchId means the main branch. A named one must be this
    // vendor's own and still open.
    const { branchId: requestedBranchId, ...listingData } = result.data;
    if (listingData.imageKey) {
      const problem = await checkOwnImageKey('listing', profile.id, listingData.imageKey);
      if (problem) return res.status(400).json({ error: problem });
    }
    const branch = requestedBranchId
      ? await findOwnBranch(profile.id, requestedBranchId)
      : await findMainBranch(profile.id);
    if (!branch || !isSellable(branch)) {
      return res.status(400).json({ error: 'Choose one of your open branches' });
    }

    const listing = await prisma.gasListing.create({
      data: { ...listingData, vendorId: profile.id, branchId: branch.id }
    });

    return res.status(201).json({ listing: withImage(listing) });
  })
);

router.patch(
  '/listings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = listingPatchSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.issues[0].message });
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

    // Moving a listing to another branch needs the same ownership check.
    if (result.data.branchId) {
      const branch = await findOwnBranch(profile.id, result.data.branchId);
      if (!branch || !isSellable(branch)) {
        return res.status(400).json({ error: 'Choose one of your open branches' });
      }
    }

    if (result.data.imageKey) {
      const problem = await checkOwnImageKey('listing', profile.id, result.data.imageKey);
      if (problem) return res.status(400).json({ error: problem });
    }

    const sizes = result.data.cylinderSizes ?? exists.cylinderSizes;
    const loose = result.data.sellsLoose ?? exists.sellsLoose;
    if (sizes.length === 0 && !loose) {
      return res.status(400).json({ error: 'Select at least one cylinder size, or sell loose gas by kg' });
    }

    const listing = await prisma.gasListing.update({ where: { id }, data: result.data });
    if (result.data.imageKey !== undefined && exists.imageKey && exists.imageKey !== result.data.imageKey) {
      await deleteImage(exists.imageKey);
    }
    return res.json({ listing: withImage(listing) });
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
    await deleteImage(exists.imageKey);
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
      return res.status(400).json({ error: result.error.issues[0].message });
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
    if (order.status === 'DELIVERED') recordEarningSafe(order.id);
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
      return res.status(400).json({ error: result.error.issues[0].message });
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
      const rider = await prisma.riderProfile.findFirst({ where: { id: riderId, ...ASSIGNABLE_RIDER } });
      if (!rider) {
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

export default router;
