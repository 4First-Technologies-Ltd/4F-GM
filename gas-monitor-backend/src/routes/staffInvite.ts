import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { issueTokenPair } from '../lib/auth';
import { LEGAL_VERSION } from '../lib/legal';
import { validatePassword } from '../lib/password';
import { inviteTokenHash } from '../lib/staff';
import { inviteLimiter } from '../lib/security';

/**
 * Public, unauthenticated: how an invited branch manager gets their account.
 * Mounted at /api/staff/invite and deliberately NOT behind the manager gate.
 *
 * The invite email carries a one-time token (only its hash is stored). Holding it
 * proves the invitee owns the address, so no separate email verification is
 * needed. The token dies on use and with the invite's expiry.
 */
const router = Router();

const INVALID = 'This invitation link is invalid or has expired. Ask the vendor to send a new one.';

/** The live invite behind a raw token, or null. */
async function findInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  return prisma.branchStaff.findFirst({
    where: { tokenHash: inviteTokenHash(token), status: 'INVITED', expiresAt: { gt: new Date() } },
    include: { branch: { select: { name: true, isActive: true, vendor: { select: { businessName: true } } } } }
  });
}

/** What the accept page shows before the manager commits. */
router.get(
  '/:token',
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const invite = await findInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: INVALID, code: 'INVITE_INVALID' });

    const existing = await prisma.user.findFirst({
      where: { email: { equals: invite.email, mode: 'insensitive' } },
      select: { role: true }
    });
    return res.json({
      invite: {
        email: invite.email,
        branchName: invite.branch.name,
        businessName: invite.branch.vendor.businessName,
        // Tells the page whether to ask for a password or just link the branch.
        accountExists: !!existing,
        canLink: existing?.role === 'BRANCH_MANAGER'
      }
    });
  })
);

const acceptSchema = z.object({
  name: z.string().trim().min(1, 'Your name is required').max(100),
  password: z.string().superRefine(validatePassword),
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the Terms and Privacy Policy' }) }),
  legalVersion: z.string().refine((v) => v === LEGAL_VERSION, {
    message: 'The Terms have been updated. Please reload and review them again.'
  })
});

router.post(
  '/:token/accept',
  inviteLimiter,
  asyncHandler(async (req, res) => {
    const invite = await findInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: INVALID, code: 'INVITE_INVALID' });

    const existing = await prisma.user.findFirst({
      where: { email: { equals: invite.email, mode: 'insensitive' } },
      select: { id: true, role: true }
    });

    // Already a manager (for another branch or vendor): just add this branch. No
    // session is issued: they sign in with the password they already have.
    if (existing?.role === 'BRANCH_MANAGER') {
      const claimed = await prisma.branchStaff.updateMany({
        where: { id: invite.id, status: 'INVITED' },
        data: { status: 'ACTIVE', userId: existing.id, tokenHash: null }
      });
      if (claimed.count === 0) return res.status(404).json({ error: INVALID, code: 'INVITE_INVALID' });
      return res.json({ status: 'LINKED', branchName: invite.branch.name });
    }

    // A consumer, vendor, rider or company account cannot also be a manager: one role per account.
    if (existing) {
      return res.status(409).json({
        error:
          'This email already has a 4FG account of a different type. Ask the vendor to invite a different email address.',
        code: 'EMAIL_IN_USE'
      });
    }

    const result = acceptSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: result.error.errors[0].message });
    const { name, password } = result.data;

    const hashed = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        // Compare-and-set on the invite first, so the link cannot be used twice.
        const claimed = await tx.branchStaff.updateMany({
          where: { id: invite.id, status: 'INVITED', tokenHash: inviteTokenHash(req.params.token) },
          data: { status: 'ACTIVE', tokenHash: null }
        });
        if (claimed.count === 0) throw new Error('INVITE_GONE');

        const created = await tx.user.create({
          data: { email: invite.email, name, password: hashed, role: 'BRANCH_MANAGER', emailVerified: true }
        });
        await tx.branchStaff.update({ where: { id: invite.id }, data: { userId: created.id } });
        await tx.legalAcceptance.createMany({
          data: (['TERMS', 'PRIVACY'] as const).map((document) => ({
            userId: created.id,
            document,
            version: LEGAL_VERSION,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent')?.slice(0, 255) ?? null
          })),
          skipDuplicates: true
        });
        return created;
      });
    } catch (err: any) {
      if (err?.message === 'INVITE_GONE') return res.status(404).json({ error: INVALID, code: 'INVITE_INVALID' });
      // Someone registered this email between the check and the insert.
      if (err?.code === 'P2002') {
        return res.status(409).json({ error: 'This email already has a 4FG account.', code: 'EMAIL_IN_USE' });
      }
      throw err;
    }

    const tokens = await issueTokenPair(user.id, user.email);
    return res.status(201).json({
      status: 'CREATED',
      user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt },
      ...tokens
    });
  })
);

export default router;
