import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { PLANS } from '../lib/plans';
import { z } from 'zod';
import { inviteExpiry, inviteLink, MAX_STAFF_PER_BRANCH, newInviteToken } from '../lib/staff';
import { sendManagerInviteEmail } from '../lib/email';
import { inviteSendLimiter } from '../lib/security';
import {
  branchPatchSchema,
  branchSchema,
  findOwnBranch,
  isSellable,
  OPEN_ORDER_STATUSES
} from '../lib/branches';

/**
 * A vendor's own branches, mounted at /api/vendor/branches. Branches can be
 * created while the vendor is still PENDING (sign-up collects them); selling
 * from them still needs approval, which listing creation enforces.
 */
const router = Router();

router.use(requireAuth);

const vendorOf = (userId: string) => prisma.vendorProfile.findUnique({ where: { userId } });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const branches = await prisma.branch.findMany({
      where: { vendorId: vendor.id },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }]
    });
    return res.json({ branches, maxBranches: PLANS[vendor.plan].maxBranches });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = branchSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const { openingHours, ...data } = result.data;
    const max = PLANS[vendor.plan].maxBranches;

    // Count and create in one serializable transaction so two parallel requests
    // cannot both slip under the plan cap. The first branch becomes the main one.
    try {
      const branch = await prisma.$transaction(
        async (tx) => {
          const active = await tx.branch.count({ where: { vendorId: vendor.id, isActive: true } });
          if (active >= max) return null;
          const hasMain = await tx.branch.count({ where: { vendorId: vendor.id, isMain: true } });
          return tx.branch.create({
            data: {
              ...data,
              ...(openingHours ? { openingHours: openingHours as object } : {}),
              vendorId: vendor.id,
              isMain: hasMain === 0
            }
          });
        },
        { isolationLevel: 'Serializable' }
      );

      if (!branch) {
        return res.status(409).json({
          error: `Your ${PLANS[vendor.plan].name} plan allows up to ${max} branch${max === 1 ? '' : 'es'}`,
          code: 'BRANCH_LIMIT'
        });
      }
      return res.status(201).json({ branch });
    } catch (err: any) {
      // Serialization conflict or the one-main unique index: the caller can retry.
      if (err?.code === 'P2034' || err?.code === 'P2002') {
        return res.status(409).json({ error: 'Please try again', code: 'CONFLICT' });
      }
      throw err;
    }
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = branchPatchSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const existing = await findOwnBranch(vendor.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });

    const { openingHours, ...data } = result.data;
    const branch = await prisma.branch.update({
      where: { id: existing.id },
      data: { ...data, ...(openingHours ? { openingHours: openingHours as object } : {}) }
    });
    return res.json({ branch });
  })
);

/** Make this branch the main one. Atomic swap keeps exactly one main. */
router.post(
  '/:id/make-main',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const existing = await findOwnBranch(vendor.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    if (!isSellable(existing)) {
      return res.status(400).json({ error: 'A closed or suspended branch cannot be the main branch' });
    }

    await prisma.$transaction([
      prisma.branch.updateMany({ where: { vendorId: vendor.id, isMain: true }, data: { isMain: false } }),
      prisma.branch.update({ where: { id: existing.id }, data: { isMain: true } })
    ]);
    return res.json({ branch: await prisma.branch.findUnique({ where: { id: existing.id } }) });
  })
);

/**
 * Close a branch. Never deletes (orders reference it). Refused for the main
 * branch (promote another first) and while the branch has orders in flight.
 * Its listings drop off the marketplace because closed branches are filtered
 * from public reads.
 */
router.post(
  '/:id/deactivate',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const existing = await findOwnBranch(vendor.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    if (!existing.isActive) return res.json({ branch: existing });
    if (existing.isMain) {
      return res
        .status(409)
        .json({ error: 'Make another branch the main branch before closing this one', code: 'IS_MAIN' });
    }

    const open = await prisma.order.count({
      where: { branchId: existing.id, status: { in: [...OPEN_ORDER_STATUSES] } }
    });
    if (open > 0) {
      return res.status(409).json({
        error: `This branch has ${open} open order${open === 1 ? '' : 's'}. Complete or cancel them first`,
        code: 'OPEN_ORDERS'
      });
    }

    const branch = await prisma.branch.update({ where: { id: existing.id }, data: { isActive: false } });
    return res.json({ branch });
  })
);

router.post(
  '/:id/reactivate',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });

    const existing = await findOwnBranch(vendor.id, req.params.id);
    if (!existing) return res.status(404).json({ error: 'Branch not found' });
    if (existing.suspendedAt) {
      return res.status(403).json({
        error: 'This branch was suspended by 4FG. Contact support to have it restored',
        code: 'BRANCH_SUSPENDED'
      });
    }
    if (existing.isActive) return res.json({ branch: existing });

    const max = PLANS[vendor.plan].maxBranches;
    const active = await prisma.branch.count({ where: { vendorId: vendor.id, isActive: true } });
    if (active >= max) {
      return res.status(409).json({ error: `Your plan allows up to ${max} active branches`, code: 'BRANCH_LIMIT' });
    }
    const branch = await prisma.branch.update({ where: { id: existing.id }, data: { isActive: true } });
    return res.json({ branch });
  })
);

// ── Branch staff ─────────────────────────────────────────────────────────────

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address') });

router.get(
  '/:id/staff',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });
    const branch = await findOwnBranch(vendor.id, req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const staff = await prisma.branchStaff.findMany({
      where: { branchId: branch.id, status: { not: 'REVOKED' } },
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' }
    });
    return res.json({ staff });
  })
);

/**
 * Invite a manager by email. They get a one-time link to a private page where they
 * set a name and password (an existing manager account is simply linked). Re-inviting
 * issues a fresh link and invalidates the old one, which is also how an expired or
 * revoked invite is renewed. Whether the email already has an account is never
 * revealed to the vendor.
 */
router.post(
  '/:id/staff',
  inviteSendLimiter,
  asyncHandler(async (req, res) => {
    const result = inviteSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });

    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });
    const branch = await findOwnBranch(vendor.id, req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const { email } = result.data;
    if (email === (req.user!.email ?? '').toLowerCase()) {
      return res.status(400).json({ error: 'You already have full access as the owner' });
    }

    const existing = await prisma.branchStaff.findUnique({ where: { branchId_email: { branchId: branch.id, email } } });
    if (existing?.status === 'ACTIVE') {
      return res.status(409).json({ error: 'That person already manages this branch' });
    }

    const live = await prisma.branchStaff.count({
      where: { branchId: branch.id, OR: [{ status: 'ACTIVE' }, { status: 'INVITED', expiresAt: { gt: new Date() } }] }
    });
    if (live >= MAX_STAFF_PER_BRANCH && existing?.status !== 'INVITED') {
      return res.status(409).json({ error: `A branch can have up to ${MAX_STAFF_PER_BRANCH} managers`, code: 'STAFF_LIMIT' });
    }

    const { token, tokenHash } = newInviteToken();
    const expiresAt = inviteExpiry();
    const staff = await prisma.branchStaff.upsert({
      where: { branchId_email: { branchId: branch.id, email } },
      create: { branchId: branch.id, email, expiresAt, tokenHash },
      update: { status: 'INVITED', userId: null, expiresAt, tokenHash },
      select: { id: true, email: true, status: true, expiresAt: true }
    });

    const emailSent = await sendManagerInviteEmail({
      to: email,
      businessName: vendor.businessName,
      branchName: branch.name,
      link: inviteLink(token),
      expiresAt
    });
    return res.status(201).json({ staff, emailSent });
  })
);

/** Revoke access immediately; the row stays as history. */
router.delete(
  '/:id/staff/:staffId',
  asyncHandler(async (req, res) => {
    const vendor = await vendorOf(req.user!.sub);
    if (!vendor) return res.status(404).json({ error: 'Vendor profile not found' });
    const branch = await findOwnBranch(vendor.id, req.params.id);
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    const row = await prisma.branchStaff.findFirst({ where: { id: req.params.staffId, branchId: branch.id } });
    if (!row) return res.status(404).json({ error: 'Staff member not found' });

    await prisma.branchStaff.update({ where: { id: row.id }, data: { status: 'REVOKED' } });
    return res.json({ message: 'Access revoked' });
  })
);

export default router;
