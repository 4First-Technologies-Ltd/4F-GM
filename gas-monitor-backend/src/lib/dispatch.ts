import { randomInt } from 'crypto';
import type { Response } from 'express';
import { z } from 'zod';
import type { OrderStatus, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { sendExpoPush } from './expoPush';
import { createTicket } from './tickets';
import { sendDeliveryPinEmail } from './email';
import { ASSIGNABLE_RIDER } from './fleet';

/**
 * Order lifecycle for the rider job pool.
 *
 *   PENDING ──pay──▶ CONFIRMED ──vendor accepts──▶ ACCEPTED ──rider picks up──▶ OUT_FOR_DELIVERY ──PIN──▶ DELIVERED
 *
 * An ACCEPTED order with no rider is in the job pool; a rider claims it by
 * setting riderId (compare-and-set). Vendors and branch managers never assign
 * riders; admins can, as a fallback. Platform orders (no vendor) skip the
 * vendor step: payment puts them straight into the pool.
 */

/** Paid orders, whatever stage they are at. */
export const PAID_STATUSES: OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
/** Paid and not finished yet. */
export const IN_FLIGHT_STATUSES: OrderStatus[] = ['CONFIRMED', 'ACCEPTED', 'OUT_FOR_DELIVERY'];
/** A rider holding an order in one of these has a job in progress. */
export const RIDER_ACTIVE_STATUSES: OrderStatus[] = ['ACCEPTED', 'OUT_FOR_DELIVERY'];
/** The job pool. */
export const POOL_WHERE = { status: 'ACCEPTED', riderId: null } satisfies Prisma.OrderWhereInput;

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60_000;

export function newDeliveryPin(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}

/** Strips the delivery PIN and its counters: everyone but the customer gets orders through this. */
export function hidePin<T extends object>(order: T): Omit<T, 'deliveryPin' | 'pinAttempts' | 'pinLockedUntil'> {
  const { deliveryPin: _p, pinAttempts: _a, pinLockedUntil: _l, ...rest } = order as T & {
    deliveryPin?: unknown;
    pinAttempts?: unknown;
    pinLockedUntil?: unknown;
  };
  return rest;
}

export const shortId = (id: string) => id.slice(0, 8).toUpperCase();

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Rider's pay for delivering an order: their share of the flat delivery fee (same maths as riderPayouts.ts). */
export const riderPayFor = (deliveryFee: number, riderSharePercent: number) =>
  Math.round(((deliveryFee * riderSharePercent) / 100) * 100) / 100;

/**
 * In-app notification (kind ORDER, refId = order id) plus a push where the
 * person allows it. Best effort: never throws, so it can't undo the order
 * change that triggered it.
 */
export async function notifyUsers(userIds: string[], title: string, body: string, orderId: string): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body, kind: 'ORDER', refId: orderId })) });
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: ids }, user: { pushEnabled: true } },
      select: { token: true }
    });
    if (tokens.length) await sendExpoPush(tokens, title, body, { kind: 'ORDER', orderId }, 'orders');
  } catch (err) {
    console.error('[dispatch] notification failed', { orderId, err });
  }
}

/** The vendor owner and the active managers of the order's branch. */
async function vendorPeople(order: { vendorId: string | null; branchId: string | null }): Promise<string[]> {
  if (!order.vendorId) return [];
  const [vendor, staff] = await Promise.all([
    prisma.vendorProfile.findUnique({ where: { id: order.vendorId }, select: { userId: true } }),
    order.branchId
      ? prisma.branchStaff.findMany({ where: { branchId: order.branchId, status: 'ACTIVE', userId: { not: null } }, select: { userId: true } })
      : Promise.resolve([])
  ]);
  return [vendor?.userId, ...staff.map((s) => s.userId)].filter((x): x is string => !!x);
}

/**
 * Runs once, right after an order moves PENDING → CONFIRMED (only the caller
 * whose compare-and-set won calls it). Platform orders go straight into the
 * pool; the customer gets their delivery PIN by email and in the app; the
 * vendor is told there is an order to accept. Never throws.
 */
export async function afterOrderPaid(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        vendorId: true,
        branchId: true,
        deliveryPin: true,
        supplierName: true,
        cylinderSize: true,
        quantity: true,
        consumer: { select: { id: true, name: true, email: true } }
      }
    });
    if (!order) return;

    let pin = order.deliveryPin;
    if (!pin) {
      pin = newDeliveryPin();
      await prisma.order.updateMany({ where: { id: orderId, deliveryPin: null }, data: { deliveryPin: pin } });
      pin = (await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryPin: true } }))?.deliveryPin ?? pin;
    }

    if (!order.vendorId) {
      const now = new Date();
      await prisma.order.updateMany({
        where: { id: orderId, status: 'CONFIRMED' },
        data: { status: 'ACCEPTED', acceptedAt: now, poolEnteredAt: now }
      });
    }

    const ref = shortId(order.id);
    void sendDeliveryPinEmail({
      to: order.consumer.email,
      name: order.consumer.name,
      pin,
      orderRef: ref,
      item: `${order.supplierName ?? 'Gas'} · ${order.cylinderSize} × ${order.quantity}`
    });
    await notifyUsers(
      [order.consumer.id],
      'Payment received',
      `Order ${ref} is paid. Your delivery PIN is ${pin}: give it to the rider when your gas arrives.`,
      orderId
    );
    if (order.vendorId) {
      await notifyUsers(await vendorPeople(order), 'New order to accept', `Order ${ref}: ${order.cylinderSize} × ${order.quantity}. Accept it so a rider can pick it up.`, orderId);
    }
  } catch (err) {
    console.error('[dispatch] after-payment step failed', { orderId, err });
  }
}

/** Answer for the removed vendor/manager rider-assignment endpoints (old app builds still call them). */
export const RIDERS_CHOOSE_JOBS = {
  error: 'Riders now choose their own jobs. Accept the order and it goes to riders automatically. Please update the app.',
  code: 'RIDERS_CHOOSE_JOBS'
} as const;

export const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() });

/** Legacy `PATCH /orders/:id { status }` from old vendor/manager builds: only CANCELLED still means something. */
export const legacyStatusSchema = z.object({ status: z.string() });

export function sendDispatchResult(res: Response, result: DispatchResult) {
  if (!result.ok) return res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
  return res.json({ order: hidePin(result.order) });
}

export type DispatchResult =
  | { ok: true; order: NonNullable<Awaited<ReturnType<typeof prisma.order.findUnique>>> }
  | { ok: false; status: number; error: string; code?: string };

const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

async function explainMiss(orderId: string, scope: Prisma.OrderWhereInput, action: string): Promise<DispatchResult> {
  const existing = await prisma.order.findFirst({ where: { id: orderId, ...scope }, select: { status: true } });
  if (!existing) return { ok: false, status: 404, error: 'Order not found' };
  if (existing.status === 'PENDING') {
    return { ok: false, status: 409, error: `This order hasn't been paid yet, so it can't be ${action}`, code: 'NOT_PAID' };
  }
  return {
    ok: false,
    status: 409,
    error: `An order that is ${label(existing.status)} can't be ${action}`,
    code: 'INVALID_STATUS_TRANSITION'
  };
}

/**
 * Vendor or branch manager accepts a paid order: it goes into the rider job
 * pool. `scope` limits which orders the caller may touch (their vendor id or
 * their branch ids) and is always part of the compare-and-set.
 */
export async function acceptOrder(orderId: string, scope: Prisma.OrderWhereInput): Promise<DispatchResult> {
  const now = new Date();
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, ...scope, status: 'CONFIRMED' },
    data: { status: 'ACCEPTED', acceptedAt: now, poolEnteredAt: now }
  });
  if (count === 0) return explainMiss(orderId, scope, 'accepted');

  const order = (await prisma.order.findUnique({ where: { id: orderId } }))!;
  await notifyUsers(
    [order.consumerId],
    'Order accepted',
    `${order.supplierName ?? 'Your vendor'} accepted order ${shortId(order.id)}. We're finding a rider to bring it to you.`,
    order.id
  );
  return { ok: true, order };
}

/**
 * The admin fallback: put a rider on an order (or take one off). Only orders
 * the vendor has accepted can be given to a rider. Taking the rider off an
 * ACCEPTED order puts it back in the pool; once picked up, it can only be
 * handed to another rider. Admins may override the one-job-at-a-time rule.
 * Compare-and-set on the status and rider that were checked.
 */
export async function assignRiderAsAdmin(
  orderId: string,
  riderId: string | null
): Promise<{ ok: true; from: string | null } | { ok: false; status: number; error: string; code?: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, status: true, riderId: true, consumerId: true } });
  if (!order) return { ok: false, status: 404, error: 'Order not found' };

  if (order.status === 'CONFIRMED') {
    return { ok: false, status: 409, error: "The vendor hasn't accepted this order yet", code: 'NOT_ACCEPTED' };
  }
  if (!RIDER_ACTIVE_STATUSES.includes(order.status)) {
    return { ok: false, status: 409, error: `An order that is ${label(order.status)} can't be given to a rider`, code: 'INVALID_STATUS_TRANSITION' };
  }

  const now = new Date();
  let riderUserId: string | null = null;
  if (riderId) {
    const rider = await prisma.riderProfile.findFirst({ where: { id: riderId, ...ASSIGNABLE_RIDER }, select: { userId: true } });
    if (!rider) return { ok: false, status: 400, error: 'Rider not found or not approved' };
    riderUserId = rider.userId;
  } else if (order.status === 'OUT_FOR_DELIVERY') {
    return {
      ok: false,
      status: 409,
      error: 'The rider has already collected this order. Hand it to another rider instead',
      code: 'ALREADY_PICKED_UP'
    };
  }

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: order.status, riderId: order.riderId },
    data: riderId ? { riderId, assignedAt: now } : { riderId: null, assignedAt: null, poolEnteredAt: now }
  });
  if (count === 0) return { ok: false, status: 409, error: 'This order just changed. Refresh and try again', code: 'STALE' };

  const ref = shortId(orderId);
  if (order.riderId && order.riderId !== riderId) {
    const previous = await prisma.riderProfile.findUnique({ where: { id: order.riderId }, select: { userId: true } });
    if (previous) await notifyUsers([previous.userId], 'Job reassigned', `4FG moved order ${ref} to another rider.`, orderId);
  }
  if (riderUserId && riderId !== order.riderId) {
    await notifyUsers([riderUserId], 'New job from 4FG', `You've been given order ${ref}. Open your jobs to see the pickup.`, orderId);
  }
  return { ok: true, from: order.riderId };
}

/**
 * Cancels a paid order that hasn't been picked up yet, and opens a refund
 * ticket: there is no automatic refund path, so an admin refunds the customer
 * by hand from that ticket. Used when a vendor rejects, and when an admin
 * applies the watcher's "no rider" cancel suggestion.
 */
export async function cancelPaidOrder(
  orderId: string,
  scope: Prisma.OrderWhereInput,
  opts: { by: 'vendor' | 'branch manager' | 'admin'; reason?: string; from?: OrderStatus[] }
): Promise<DispatchResult> {
  const from = opts.from ?? ['CONFIRMED', 'ACCEPTED'];
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, ...scope, status: { in: from } },
    data: { status: 'CANCELLED' }
  });
  if (count === 0) return explainMiss(orderId, scope, 'cancelled');

  const order = (await prisma.order.findUnique({
    where: { id: orderId },
    include: { consumer: { select: { name: true, email: true } }, rider: { select: { userId: true } } }
  }))!;
  const ref = shortId(order.id);
  const reason = opts.reason?.trim().slice(0, 300);
  const who = opts.by === 'admin' ? '4FG' : (order.supplierName ?? 'The vendor');

  try {
    await createTicket({
      subject: `Refund needed: order ${ref} cancelled by ${opts.by}`,
      message: [
        `Order ${order.id} (₦${order.totalAmount.toLocaleString('en-NG')}, paid via ${order.paymentProvider}, ref ${order.paystackRef ?? 'n/a'}) was cancelled by the ${opts.by} after payment.`,
        reason ? `Reason given: ${reason}` : 'No reason was given.',
        order.vendorSettledByGateway
          ? `The gateway already paid the vendor ₦${(order.vendorSplitAmount ?? 0).toLocaleString('en-NG')} at checkout: recover it from the vendor as part of the refund.`
          : 'The vendor has not been paid for this order.',
        'Refund the customer in full, then reply to them on this ticket and resolve it.'
      ].join('\n\n'),
      requesterName: order.consumer.name,
      requesterEmail: order.consumer.email,
      channel: 'ADMIN',
      category: 'PAYMENT',
      priority: 'HIGH',
      orderId: order.id,
      author: 'SYSTEM'
    });
  } catch (err) {
    console.error('[dispatch] refund ticket could not be opened', { orderId, err });
  }

  await notifyUsers(
    [order.consumerId],
    'Order cancelled',
    `${who} couldn't fulfil order ${ref}, so it has been cancelled.${reason ? ` Reason: ${reason}` : ''} Our team will refund you and be in touch.`,
    order.id
  );
  const riderUserId = order.rider?.userId;
  if (riderUserId) {
    await notifyUsers([riderUserId], 'Job cancelled', `Order ${ref} was cancelled before pickup. You're free to take another job.`, order.id);
  }
  return { ok: true, order: hidePin(order) as typeof order };
}
