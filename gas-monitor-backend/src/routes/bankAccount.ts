import { Router, type Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { asyncHandler } from '../lib/asyncHandler';
import { bankAccountLimiter } from '../lib/security';
import { PaystackError, listBanks, resolveAccount } from '../lib/paystack';
import { dispatchWaitingForRider, riderAutoPayoutEnabled } from '../lib/riderPayouts';

/**
 * A vendor's or rider's own payout account, mounted at /api/bank.
 *
 * The account name is always resolved from the bank, never typed, and changing
 * the account needs the account password: this is where a hijacked session would
 * redirect money. Admins can still set a vendor's account from the panel.
 * Responses mask the account number; the full number is never sent back.
 */
const router = Router();

type Owner = { kind: 'VENDOR'; profileId: string } | { kind: 'RIDER'; profileId: string };

/** The signed-in user's payout owner, or answers 403/404 and returns null. */
async function loadOwner(userId: string, res: Response): Promise<Owner | null> {
  const role = (await prisma.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role;
  if (role === 'VENDOR') {
    const p = await prisma.vendorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (p) return { kind: 'VENDOR', profileId: p.id };
    res.status(404).json({ error: 'Create your vendor profile first' });
    return null;
  }
  if (role === 'RIDER') {
    const p = await prisma.riderProfile.findUnique({ where: { userId }, select: { id: true } });
    if (p) return { kind: 'RIDER', profileId: p.id };
    res.status(404).json({ error: 'Create your rider profile first' });
    return null;
  }
  res.status(403).json({ error: 'Only vendors and riders have a payout account' });
  return null;
}

const mask = (a: { bankName: string; accountName: string; accountNumber: string; updatedAt: Date }) => ({
  bankName: a.bankName,
  accountName: a.accountName,
  last4: a.accountNumber.slice(-4),
  updatedAt: a.updatedAt
});

router.get(
  '/banks',
  requireAuth,
  asyncHandler(async (_req, res) => {
    try {
      return res.json({ banks: await listBanks() });
    } catch (err) {
      if (err instanceof PaystackError) return res.status(502).json({ error: 'Could not load banks. Try again shortly.' });
      throw err;
    }
  })
);

router.get(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    const owner = await loadOwner(req.user!.sub, res);
    if (!owner) return;
    const account =
      owner.kind === 'VENDOR'
        ? await prisma.vendorBankAccount.findUnique({ where: { vendorId: owner.profileId } })
        : await prisma.riderBankAccount.findUnique({ where: { riderId: owner.profileId } });
    return res.json({ account: account ? mask(account) : null });
  })
);

const accountSchema = z.object({
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
  password: z.string().min(1, 'Enter your password to confirm')
});

router.put(
  '/account',
  requireAuth,
  bankAccountLimiter,
  asyncHandler(async (req, res) => {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { bankCode, accountNumber, password } = parsed.data;

    const owner = await loadOwner(req.user!.sub, res);
    if (!owner) return;

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { password: true } });
    // 403, not 401: the app treats 401 as an expired session and signs the user out.
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(403).json({ error: 'Incorrect password', code: 'WRONG_PASSWORD' });
    }

    // Money may already be on its way to the old account.
    if (owner.kind === 'VENDOR') {
      const inFlight = await prisma.payout.count({
        where: { vendorId: owner.profileId, status: { in: ['PENDING', 'PROCESSING'] } }
      });
      if (inFlight > 0) {
        return res.status(409).json({
          error: 'A payout is being processed. You can change your account once it completes.',
          code: 'PAYOUT_IN_FLIGHT'
        });
      }
    }

    try {
      const bank = (await listBanks()).find((b) => b.code === bankCode);
      if (!bank) return res.status(400).json({ error: 'Unknown bank' });
      const { accountName } = await resolveAccount(accountNumber, bankCode);

      const fields = { bankCode, bankName: bank.name, accountNumber, accountName };
      // A new account invalidates the cached Paystack transfer recipient.
      const reset = { ...fields, paystackRecipientCode: null };
      // Gateway payee codes (split settlement) belong to the old account too.
      const vendorReset = { ...reset, gatewayRecipients: {} };
      const saved =
        owner.kind === 'VENDOR'
          ? await prisma.vendorBankAccount.upsert({
              where: { vendorId: owner.profileId },
              create: { vendorId: owner.profileId, ...fields },
              update: vendorReset
            })
          : await prisma.riderBankAccount.upsert({
              where: { riderId: owner.profileId },
              create: { riderId: owner.profileId, ...fields },
              update: reset
            });
      // Delivery pay that was waiting for an account can go out now.
      if (owner.kind === 'RIDER' && riderAutoPayoutEnabled()) {
        dispatchWaitingForRider(owner.profileId).catch((e) => console.error('[rider-pay] waiting dispatch failed', e));
      }
      return res.json({ account: mask(saved) });
    } catch (err) {
      if (err instanceof PaystackError) {
        return res.status(err.indeterminate ? 502 : 400).json({ error: err.message });
      }
      throw err;
    }
  })
);

export default router;
