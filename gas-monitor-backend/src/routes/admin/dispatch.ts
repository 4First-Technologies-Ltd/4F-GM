import { Router } from 'express';
import { DispatchSuggestionStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog } from '../../lib/audit';
import { assignRiderAsAdmin, cancelPaidOrder, shortId } from '../../lib/dispatch';
import { expireStaleSuggestions, stillApplies } from '../../lib/dispatchWatcher';

/**
 * Admin view of the rider job pool and the dispatch watcher's suggestions.
 * Reading is open to every admin; applying or dismissing a suggestion is an
 * operational decision (OPERATIONS). Applying CANCEL_ORDER is the one place an
 * admin changes an order's status: it cancels a paid order nobody would deliver
 * and opens the refund ticket, and it is audited.
 */
const router = Router();

const ORDER_STATE_SELECT = { status: true, riderId: true, poolEnteredAt: true, confirmedAt: true, pickedUpAt: true } as const;

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await expireStaleSuggestions();
    const status = typeof req.query.status === 'string' && req.query.status in DispatchSuggestionStatus
      ? (req.query.status as DispatchSuggestionStatus)
      : 'OPEN';

    const [suggestions, pool, awaitingVendor, onlineRiders] = await Promise.all([
      prisma.dispatchSuggestion.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          order: {
            select: {
              id: true, status: true, supplierName: true, cylinderSize: true, quantity: true, deliveryAddress: true,
              totalAmount: true, poolEnteredAt: true, riderId: true,
              consumer: { select: { name: true, phone: true } }
            }
          }
        }
      }),
      prisma.order.findMany({
        where: { status: 'ACCEPTED', riderId: null },
        orderBy: { poolEnteredAt: 'asc' },
        take: 100,
        select: {
          id: true, supplierName: true, cylinderSize: true, quantity: true, deliveryAddress: true, poolEnteredAt: true,
          branch: { select: { name: true, city: true } }
        }
      }),
      prisma.order.count({ where: { status: 'CONFIRMED', vendorId: { not: null } } }),
      prisma.riderProfile.count({ where: { isOnline: true, lastSeenAt: { gte: new Date(Date.now() - 2 * 60 * 60_000) } } })
    ]);

    return res.json({ suggestions, pool, awaitingVendor, onlineRiders });
  })
);

const applySchema = z.object({ reason: z.string().trim().max(300).optional() });

router.post(
  '/:id/apply',
  requireOperations,
  asyncHandler(async (req, res) => {
    const parsed = applySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const s = await prisma.dispatchSuggestion.findUnique({
      where: { id: req.params.id },
      include: { order: { select: ORDER_STATE_SELECT } }
    });
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });
    if (s.status !== 'OPEN') return res.status(409).json({ error: `This suggestion is already ${s.status.toLowerCase()}`, code: 'NOT_OPEN' });
    if (!stillApplies(s, s.order)) {
      await prisma.dispatchSuggestion.updateMany({ where: { id: s.id, status: 'OPEN' }, data: { status: 'EXPIRED', resolvedAt: new Date() } });
      return res.status(409).json({ error: 'The order has moved on, so this no longer applies', code: 'EXPIRED' });
    }

    // Claim first so two admins can't both apply it; put it back if the action fails.
    const claimed = await prisma.dispatchSuggestion.updateMany({
      where: { id: s.id, status: 'OPEN' },
      data: { status: 'APPLIED', resolvedAt: new Date(), resolvedById: req.admin!.adminId, resolvedByName: req.admin!.name }
    });
    if (claimed.count === 0) return res.status(409).json({ error: 'Someone else just handled this', code: 'NOT_OPEN' });
    const reopen = () => prisma.dispatchSuggestion.update({
      where: { id: s.id },
      data: { status: 'OPEN', resolvedAt: null, resolvedById: null, resolvedByName: null }
    });

    const ref = shortId(s.orderId);
    if (s.action === 'ASSIGN_RIDER') {
      const riderId = String((s.payload as { riderId?: string } | null)?.riderId ?? '');
      const outcome = await assignRiderAsAdmin(s.orderId, riderId || null);
      if (!outcome.ok) {
        await reopen();
        return res.status(outcome.status).json({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });
      }
      await writeAuditLog(req, {
        action: 'ORDER_RIDER_ASSIGNED',
        resource: 'order',
        resourceId: s.orderId,
        summary: `Order ${s.orderId}: assigned to ${(s.payload as { riderName?: string } | null)?.riderName ?? riderId} (dispatch suggestion)`,
        metadata: { from: outcome.from, to: riderId, suggestionId: s.id }
      });
    } else if (s.action === 'CANCEL_ORDER') {
      const reason = parsed.data.reason || 'No rider was available to deliver it';
      const outcome = await cancelPaidOrder(s.orderId, { riderId: null }, { by: 'admin', reason, from: ['ACCEPTED'] });
      if (!outcome.ok) {
        await reopen();
        return res.status(outcome.status).json({ error: outcome.error, ...(outcome.code ? { code: outcome.code } : {}) });
      }
    }

    await writeAuditLog(req, {
      action: 'DISPATCH_SUGGESTION_APPLIED',
      resource: 'dispatch',
      resourceId: s.id,
      summary: `Dispatch: ${s.action.toLowerCase().replace(/_/g, ' ')} applied for order ${ref}`,
      metadata: { orderId: s.orderId, action: s.action, payload: s.payload, reason: parsed.data.reason ?? null }
    });
    return res.json({ ok: true });
  })
);

router.post(
  '/:id/dismiss',
  requireOperations,
  asyncHandler(async (req, res) => {
    const s = await prisma.dispatchSuggestion.findUnique({ where: { id: req.params.id }, select: { id: true, orderId: true, action: true } });
    if (!s) return res.status(404).json({ error: 'Suggestion not found' });
    const { count } = await prisma.dispatchSuggestion.updateMany({
      where: { id: s.id, status: 'OPEN' },
      data: { status: 'DISMISSED', resolvedAt: new Date(), resolvedById: req.admin!.adminId, resolvedByName: req.admin!.name }
    });
    if (count === 0) return res.status(409).json({ error: 'This suggestion is no longer open', code: 'NOT_OPEN' });
    await writeAuditLog(req, {
      action: 'DISPATCH_SUGGESTION_DISMISSED',
      resource: 'dispatch',
      resourceId: s.id,
      summary: `Dispatch: ${s.action.toLowerCase().replace(/_/g, ' ')} dismissed for order ${shortId(s.orderId)}`,
      metadata: { orderId: s.orderId, action: s.action }
    });
    return res.json({ ok: true });
  })
);

export default router;
