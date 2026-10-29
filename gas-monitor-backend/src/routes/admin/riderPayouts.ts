import { Router } from 'express';
import { RiderEarningStatus } from '@prisma/client';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog } from '../../lib/audit';
import { dispatchRiderEarning } from '../../lib/riderPayouts';

/**
 * Riders' delivery pay (`RiderEarning`), mounted at /api/admin/rider-payouts.
 * Read-only for every admin; retrying a transfer needs OPERATIONS.
 */
const router = Router();

const STATUSES = new Set<string>(['PENDING', 'PROCESSING', 'PAID', 'FAILED']);

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' && STATUSES.has(req.query.status) ? req.query.status : undefined;
    const rows = await prisma.riderEarning.findMany({
      where: status ? { status: status as RiderEarningStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        rider: { select: { phone: true, user: { select: { name: true, email: true } }, bankAccount: { select: { id: true } } } },
        order: { select: { id: true, supplierName: true } }
      }
    });
    return res.json({
      earnings: rows.map(({ rider, ...r }) => ({
        ...r,
        riderName: rider.user.name,
        riderPhone: rider.phone,
        hasBankAccount: !!rider.bankAccount
      }))
    });
  })
);

router.post(
  '/:id/retry',
  requireOperations,
  asyncHandler(async (req, res) => {
    const existing = await prisma.riderEarning.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Rider payout not found' });
    if (existing.status !== 'PENDING' && existing.status !== 'FAILED') {
      return res.status(409).json({ error: `A ${existing.status.toLowerCase()} payout cannot be retried` });
    }
    const earning = await dispatchRiderEarning(existing.id);
    await writeAuditLog(req, {
      action: 'PAYOUT_RETRIED',
      resource: 'rider_earning',
      resourceId: earning.id,
      summary: `Retried ₦${earning.amount.toLocaleString()} rider pay (${earning.status})`,
      metadata: { reference: earning.reference }
    });
    return res.json({ earning });
  })
);

export default router;
