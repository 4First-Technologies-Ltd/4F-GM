import { Request, Response, Router } from 'express';
import { EarningStatus, PayoutStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations, requireSuperAdmin } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { orderBy, paginated, parseListQuery } from '../../lib/listQuery';
import { writeAuditLog } from '../../lib/audit';
import { syncEarnings } from '../../lib/earnings';
import { PaystackError, listBanks, resolveAccount } from '../../lib/paystack';
import {
  MIN_PAYOUT_NAIRA,
  PayoutError,
  cancelPayout,
  dispatchPayout,
  initiatePayout,
  markPaid
} from '../../lib/payouts';

const router = Router();

const actorOf = (req: Request) => ({
  id: req.admin!.adminId,
  name: req.admin!.name
});

const money = (n: number | null | undefined) => Math.round((n ?? 0) * 100) / 100;

/** Turn the payout service's typed failures into HTTP responses. */
function sendPayoutError(res: Response, err: unknown) {
  if (err instanceof PayoutError) return res.status(err.status).json({ error: err.message });
  if (err instanceof PaystackError) return res.status(502).json({ error: `Paystack: ${err.message}` });
  throw err;
}

// ── Overview ────────────────────────────────────────────────────────────────

router.get(
  '/summary',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [byStatus, commission, awaiting] = await Promise.all([
      prisma.earning.groupBy({ by: ['status'], _sum: { netAmount: true }, _count: true }),
      prisma.earning.aggregate({ _sum: { commissionAmount: true, grossAmount: true } }),
      prisma.payout.count({ where: { status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } } })
    ]);
    const sumFor = (s: EarningStatus) => money(byStatus.find((r) => r.status === s)?._sum.netAmount);
    const countFor = (s: EarningStatus) => byStatus.find((r) => r.status === s)?._count ?? 0;

    return res.json({
      available: sumFor('AVAILABLE'),
      availableCount: countFor('AVAILABLE'),
      inPayout: sumFor('IN_PAYOUT'),
      paid: sumFor('PAID'),
      commissionEarned: money(commission._sum.commissionAmount),
      grossVolume: money(commission._sum.grossAmount),
      payoutsNeedingAttention: awaiting,
      minimumPayout: MIN_PAYOUT_NAIRA
    });
  })
);

/** Vendors with money owed to them, largest first. */
router.get(
  '/balances',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const groups = await prisma.earning.groupBy({
      by: ['vendorId'],
      where: { status: 'AVAILABLE' },
      _sum: { netAmount: true },
      _count: true
    });
    const vendors = await prisma.vendorProfile.findMany({
      where: { id: { in: groups.map((g) => g.vendorId) } },
      select: {
        id: true,
        businessName: true,
        plan: true,
        status: true,
        bankAccount: { select: { bankName: true, accountNumber: true, accountName: true } }
      }
    });
    const byId = new Map(vendors.map((v) => [v.id, v]));

    const data = groups
      .map((g) => {
        const vendor = byId.get(g.vendorId);
        const available = money(g._sum.netAmount);
        return {
          vendorId: g.vendorId,
          businessName: vendor?.businessName ?? 'Unknown vendor',
          plan: vendor?.plan ?? null,
          vendorStatus: vendor?.status ?? null,
          bankAccount: vendor?.bankAccount ?? null,
          available,
          earningsCount: g._count,
          payable: !!vendor?.bankAccount && vendor.status === 'APPROVED' && available >= MIN_PAYOUT_NAIRA
        };
      })
      .sort((a, b) => b.available - a.available);

    return res.json({ data, minimumPayout: MIN_PAYOUT_NAIRA });
  })
);

// ── Earnings ledger ─────────────────────────────────────────────────────────

router.get(
  '/earnings',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status, vendorId } = req.query;

    const where: Prisma.EarningWhereInput = {};
    if (typeof status === 'string' && status in EarningStatus) where.status = status as EarningStatus;
    if (typeof vendorId === 'string' && vendorId) where.vendorId = vendorId;
    if (query.q) {
      where.OR = [
        { orderId: { contains: query.q, mode: 'insensitive' } },
        { vendor: { businessName: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.earning.findMany({
        where,
        include: { vendor: { select: { id: true, businessName: true } } },
        orderBy: orderBy(query, ['createdAt', 'netAmount', 'grossAmount'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.earning.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.post(
  '/sync-earnings',
  requireOperations,
  asyncHandler(async (req, res) => {
    const created = await syncEarnings();
    await writeAuditLog(req, {
      action: 'EARNINGS_SYNCED',
      resource: 'earning',
      summary: `Backfilled ${created} earning${created === 1 ? '' : 's'} from delivered orders`,
      metadata: { created }
    });
    return res.json({ created });
  })
);

// ── Banks & vendor bank accounts ────────────────────────────────────────────

router.get(
  '/banks',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    try {
      return res.json({ banks: await listBanks() });
    } catch (err) {
      return sendPayoutError(res, err);
    }
  })
);

const bankAccountSchema = z.object({
  bankCode: z.string().min(2).max(10),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits')
});

router.put(
  '/vendors/:vendorId/bank-account',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = bankAccountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: req.params.vendorId },
      select: { id: true, businessName: true }
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    try {
      const { bankCode, accountNumber } = parsed.data;
      const bank = (await listBanks()).find((b) => b.code === bankCode);
      if (!bank) return res.status(400).json({ error: 'Unknown bank' });

      // The account name comes from the bank, never from the admin: it is what
      // stops a payout being pointed at someone else's account by typo.
      const { accountName } = await resolveAccount(accountNumber, bankCode);

      const bankAccount = await prisma.vendorBankAccount.upsert({
        where: { vendorId: vendor.id },
        create: { vendorId: vendor.id, bankCode, bankName: bank.name, accountNumber, accountName },
        // A new account invalidates the cached Paystack recipient.
        update: { bankCode, bankName: bank.name, accountNumber, accountName, paystackRecipientCode: null }
      });

      await writeAuditLog(req, {
        action: 'PAYOUT_ACCOUNT_SET',
        resource: 'vendor',
        resourceId: vendor.id,
        summary: `${vendor.businessName}: payout account set to ${bank.name} ••${accountNumber.slice(-4)}`,
        metadata: { bankName: bank.name, last4: accountNumber.slice(-4), accountName }
      });

      return res.json({ bankAccount });
    } catch (err) {
      return sendPayoutError(res, err);
    }
  })
);

// ── Payouts ─────────────────────────────────────────────────────────────────

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = parseListQuery(req);
    const { status, vendorId } = req.query;

    const where: Prisma.PayoutWhereInput = {};
    if (typeof status === 'string' && status in PayoutStatus) where.status = status as PayoutStatus;
    if (typeof vendorId === 'string' && vendorId) where.vendorId = vendorId;
    if (query.q) {
      where.OR = [
        { reference: { contains: query.q, mode: 'insensitive' } },
        { accountName: { contains: query.q, mode: 'insensitive' } },
        { vendor: { businessName: { contains: query.q, mode: 'insensitive' } } }
      ];
    }

    const [data, total] = await Promise.all([
      prisma.payout.findMany({
        where,
        include: {
          vendor: { select: { id: true, businessName: true } },
          _count: { select: { earnings: true } }
        },
        orderBy: orderBy(query, ['createdAt', 'amount', 'status'] as const, 'createdAt'),
        skip: query.skip,
        take: query.take
      }),
      prisma.payout.count({ where })
    ]);
    return res.json(paginated(data, total, query));
  })
);

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const payout = await prisma.payout.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { id: true, businessName: true, phone: true } },
        earnings: { orderBy: { createdAt: 'asc' } }
      }
    });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    return res.json({ payout });
  })
);

const initiateSchema = z.object({ vendorId: z.string().min(1) });

router.post(
  '/',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = initiateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    try {
      const payout = await initiatePayout(parsed.data.vendorId, actorOf(req));
      await writeAuditLog(req, {
        action: 'PAYOUT_INITIATED',
        resource: 'payout',
        resourceId: payout.id,
        summary: `₦${payout.amount.toLocaleString()} to ${payout.accountName} (${payout.status})`,
        metadata: { vendorId: payout.vendorId, amount: payout.amount, reference: payout.reference }
      });
      return res.status(201).json({ payout });
    } catch (err) {
      return sendPayoutError(res, err);
    }
  })
);

router.post(
  '/:id/retry',
  requireOperations,
  asyncHandler(async (req, res) => {
    try {
      const existing = await prisma.payout.findUnique({ where: { id: req.params.id } });
      if (!existing) return res.status(404).json({ error: 'Payout not found' });
      if (existing.status !== 'FAILED' && existing.status !== 'PENDING') {
        return res.status(409).json({ error: `A ${existing.status.toLowerCase()} payout cannot be retried` });
      }
      const payout = await dispatchPayout(existing.id);
      await writeAuditLog(req, {
        action: 'PAYOUT_RETRIED',
        resource: 'payout',
        resourceId: payout.id,
        summary: `Retried ₦${payout.amount.toLocaleString()} to ${payout.accountName} (${payout.status})`,
        metadata: { reference: payout.reference }
      });
      return res.json({ payout });
    } catch (err) {
      return sendPayoutError(res, err);
    }
  })
);

router.post(
  '/:id/cancel',
  requireOperations,
  asyncHandler(async (req, res) => {
    try {
      const payout = await cancelPayout(req.params.id);
      await writeAuditLog(req, {
        action: 'PAYOUT_CANCELLED',
        resource: 'payout',
        resourceId: payout.id,
        summary: `Cancelled ₦${payout.amount.toLocaleString()} to ${payout.accountName}; earnings released`,
        metadata: { reference: payout.reference }
      });
      return res.json({ payout });
    } catch (err) {
      return sendPayoutError(res, err);
    }
  })
);

const markPaidSchema = z.object({ note: z.string().trim().min(3, 'Add a note saying how it was paid').max(300) });

// Settling outside Paystack (e.g. the transfer balance was empty and finance
// paid by hand) is a money-recording decision, so it is super-admin only.
router.post(
  '/:id/mark-paid',
  requireSuperAdmin,
  asyncHandler(async (req, res) => {
    const parsed = markPaidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const existing = await prisma.payout.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Payout not found' });
    if (existing.status !== 'FAILED' && existing.status !== 'PENDING') {
      return res.status(409).json({ error: `A ${existing.status.toLowerCase()} payout cannot be marked paid` });
    }

    const payout = await markPaid(existing.id);
    await writeAuditLog(req, {
      action: 'PAYOUT_MARKED_PAID',
      resource: 'payout',
      resourceId: payout.id,
      summary: `Marked ₦${payout.amount.toLocaleString()} to ${payout.accountName} as paid manually`,
      metadata: { reference: payout.reference, note: parsed.data.note }
    });
    return res.json({ payout });
  })
);

export default router;
