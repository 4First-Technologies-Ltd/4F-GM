import type { DispatchAction, DispatchSuggestion } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ASSIGNABLE_RIDER } from './fleet';
import { RIDER_ACTIVE_STATUSES, haversineKm, notifyUsers, riderPayFor, shortId } from './dispatch';
import { getOrCreateSettings } from './settings';
import { sendTelegram } from './opsBriefing';

/**
 * Dispatch watcher (rule-based, no LLM), ported from GoBuyMe. Every minute it
 * looks at orders waiting on someone and, once per "episode" (each time an
 * order starts waiting), takes one step per threshold:
 *
 *   in the pool ≥ notifyAfter  → push the job to nearby online riders (automatic)
 *   in the pool ≥ assignAfter  → suggest the nearest idle rider (an admin applies it)
 *   in the pool ≥ cancelAfter  → suggest cancelling with a refund (an admin applies it)
 *   paid, vendor hasn't accepted ≥ vendorStall   → suggest calling the vendor
 *   out for delivery ≥ deliveryStall             → suggest calling the rider
 *
 * Steps are de-duplicated by `dispatch_suggestions.dedupeKey`, so a restart or a
 * second instance never repeats one. Suggestions whose order has moved on expire.
 * `DISPATCH_WATCHER_ENABLED=false` turns it off.
 */

export interface DispatchSettings {
  notifyAfterMin: number;
  assignAfterMin: number;
  cancelAfterMin: number;
  radiusKm: number;
  vendorStallMin: number;
  deliveryStallMin: number;
}

export interface PoolOrder {
  id: string;
  vendorName: string;
  riderPay: number;
  episode: Date;
  pickup: { lat: number; lng: number } | null;
  /** The customer and vendor owner: never alerted about, or suggested for, their own order. */
  excludeUserIds: string[];
}

export interface Candidate {
  riderId: string;
  userId: string;
  name: string;
  busy: boolean;
  location: { lat: number; lng: number } | null;
}

export interface StalledOrder {
  id: string;
  episode: Date;
  contactName: string;
  phone: string | null;
}

export interface PlannedStep {
  orderId: string;
  action: DispatchAction;
  title: string;
  reason: string;
  episode: Date;
  payload?: Record<string, unknown>;
  dedupeKey: string;
}

/** Riders silent for longer than this are treated as offline even if they never switched off. */
export const ONLINE_GRACE_MS = 2 * 60 * 60_000;
export const MAX_RIDERS_PER_ALERT = 20;

const minutesSince = (d: Date, now: Date) => Math.floor((now.getTime() - d.getTime()) / 60_000);
const keyFor = (action: DispatchAction, orderId: string, episode: Date) => `${action}:${orderId}:${episode.getTime()}`;

/** Idle riders near the pickup, nearest first; riders with no known location (or no pickup location) come last. */
export function ridersNear(order: PoolOrder, candidates: Candidate[], radiusKm: number) {
  return candidates
    .filter((c) => !c.busy && !order.excludeUserIds.includes(c.userId))
    .map((c) => ({ ...c, distanceKm: order.pickup && c.location ? Math.round(haversineKm(order.pickup, c.location) * 10) / 10 : null }))
    .filter((c) => c.distanceKm == null || c.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

/** Pure: what to do this tick. */
export function planDispatch(input: {
  now: Date;
  settings: DispatchSettings;
  pool: PoolOrder[];
  candidates: Candidate[];
  stalledVendors: StalledOrder[];
  stalledDeliveries: StalledOrder[];
}): PlannedStep[] {
  const { now, settings: s } = input;
  const out: PlannedStep[] = [];
  const step = (orderId: string, action: DispatchAction, episode: Date, title: string, reason: string, payload?: Record<string, unknown>) =>
    out.push({ orderId, action, episode, title, reason, payload, dedupeKey: keyFor(action, orderId, episode) });

  for (const o of input.pool) {
    const waited = minutesSince(o.episode, now);
    const ref = shortId(o.id);
    const near = ridersNear(o, input.candidates, s.radiusKm);

    if (waited >= s.notifyAfterMin) {
      step(o.id, 'NOTIFY_RIDERS', o.episode, `Alerted riders near ${o.vendorName} about ${ref}`,
        `Order ${ref} has been in the job pool for ${waited} min.`,
        { riderUserIds: near.slice(0, MAX_RIDERS_PER_ALERT).map((r) => r.userId), vendorName: o.vendorName, riderPay: o.riderPay });
    }

    if (waited >= s.assignAfterMin) {
      const best = near[0];
      if (best) {
        const where = best.distanceKm != null ? `${best.distanceKm} km away` : 'location unknown';
        step(o.id, 'ASSIGN_RIDER', o.episode, `Give ${ref} to ${best.name} (${where})`,
          `In the pool for ${waited} min and no rider has taken it. ${best.name} is the nearest idle online rider (${where}).`,
          { riderId: best.riderId, riderName: best.name, distanceKm: best.distanceKm });
      }
    }

    if (waited >= s.cancelAfterMin) {
      step(o.id, 'CANCEL_ORDER', o.episode, `Cancel ${ref}: no rider for ${waited} min`,
        `Order ${ref} from ${o.vendorName} has waited ${waited} min for a rider${near.length === 0 ? ' and no idle rider is online nearby' : ''}. Cancelling opens a refund ticket; consider calling the customer first.`);
    }
  }

  for (const v of input.stalledVendors) {
    const mins = minutesSince(v.episode, now);
    step(v.id, 'FOLLOW_UP_VENDOR', v.episode, `Call ${v.contactName} about ${shortId(v.id)} (paid ${mins} min ago, not accepted)`,
      `${v.contactName} hasn't accepted paid order ${shortId(v.id)} after ${mins} min${v.phone ? `. Phone: ${v.phone}` : ''}.`,
      { phone: v.phone });
  }

  for (const d of input.stalledDeliveries) {
    const mins = minutesSince(d.episode, now);
    step(d.id, 'FOLLOW_UP_DELIVERY', d.episode, `Call rider ${d.contactName} about ${shortId(d.id)} (${mins} min since pickup)`,
      `Order ${shortId(d.id)} was picked up ${mins} min ago and isn't delivered${d.phone ? `. Rider phone: ${d.phone}` : ''}. Check on the rider and the customer.`,
      { phone: d.phone });
  }

  return out;
}

export function settingsFrom(row: Awaited<ReturnType<typeof getOrCreateSettings>>): DispatchSettings {
  return {
    notifyAfterMin: row.dispatchNotifyAfterMin,
    assignAfterMin: row.dispatchAssignAfterMin,
    cancelAfterMin: row.dispatchCancelAfterMin,
    radiusKm: row.dispatchRadiusKm,
    vendorStallMin: row.dispatchVendorStallMin,
    deliveryStallMin: row.dispatchDeliveryStallMin
  };
}

const LOOKBACK_MS = 48 * 60 * 60_000;

async function collect(now: Date, s: DispatchSettings, riderSharePercent: number) {
  const lookback = new Date(now.getTime() - LOOKBACK_MS);
  const before = (min: number) => new Date(now.getTime() - min * 60_000);

  const [pool, riders, vendors, deliveries] = await Promise.all([
    prisma.order.findMany({
      where: { status: 'ACCEPTED', riderId: null, poolEnteredAt: { gte: lookback, lte: before(s.notifyAfterMin) } },
      select: {
        id: true, consumerId: true, poolEnteredAt: true, deliveryFee: true, supplierName: true,
        vendor: { select: { businessName: true, userId: true } },
        branch: { select: { lat: true, lng: true } }
      },
      take: 200
    }),
    prisma.riderProfile.findMany({
      where: { ...ASSIGNABLE_RIDER, isOnline: true, lastSeenAt: { gte: new Date(now.getTime() - ONLINE_GRACE_MS) }, user: { isSuspended: false } },
      select: {
        id: true, userId: true, lat: true, lng: true,
        user: { select: { name: true } },
        _count: { select: { orders: { where: { status: { in: RIDER_ACTIVE_STATUSES } } } } }
      },
      take: 500
    }),
    prisma.order.findMany({
      where: { status: 'CONFIRMED', vendorId: { not: null }, confirmedAt: { gte: lookback, lte: before(s.vendorStallMin) } },
      select: {
        id: true, confirmedAt: true,
        vendor: { select: { businessName: true, phone: true } },
        branch: { select: { name: true, phone: true } }
      },
      take: 100
    }),
    prisma.order.findMany({
      where: { status: 'OUT_FOR_DELIVERY', pickedUpAt: { gte: lookback, lte: before(s.deliveryStallMin) } },
      select: { id: true, pickedUpAt: true, rider: { select: { phone: true, user: { select: { name: true } } } } },
      take: 100
    })
  ]);

  return {
    pool: pool.map<PoolOrder>((o) => ({
      id: o.id,
      vendorName: o.vendor?.businessName ?? o.supplierName ?? '4FG',
      riderPay: riderPayFor(o.deliveryFee, riderSharePercent),
      episode: o.poolEnteredAt!,
      pickup: o.branch?.lat != null && o.branch?.lng != null ? { lat: o.branch.lat, lng: o.branch.lng } : null,
      excludeUserIds: [o.consumerId, o.vendor?.userId].filter((x): x is string => !!x)
    })),
    candidates: riders.map<Candidate>((r) => ({
      riderId: r.id,
      userId: r.userId,
      name: r.user.name,
      busy: r._count.orders > 0,
      location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null
    })),
    stalledVendors: vendors.map<StalledOrder>((o) => ({
      id: o.id,
      episode: o.confirmedAt!,
      contactName: o.branch?.name && o.vendor ? `${o.vendor.businessName} (${o.branch.name})` : (o.vendor?.businessName ?? 'the vendor'),
      phone: o.branch?.phone ?? o.vendor?.phone ?? null
    })),
    stalledDeliveries: deliveries.map<StalledOrder>((o) => ({
      id: o.id,
      episode: o.pickedUpAt!,
      contactName: o.rider?.user.name ?? 'the rider',
      phone: o.rider?.phone ?? null
    }))
  };
}

/** Whether an OPEN suggestion still matches its order. */
export function stillApplies(
  s: Pick<DispatchSuggestion, 'action' | 'episode'>,
  order: { status: string; riderId: string | null; poolEnteredAt: Date | null; confirmedAt: Date | null; pickedUpAt: Date | null } | null
): boolean {
  if (!order) return false;
  const same = (d: Date | null) => !!d && d.getTime() === s.episode.getTime();
  switch (s.action) {
    case 'ASSIGN_RIDER':
    case 'CANCEL_ORDER':
    case 'NOTIFY_RIDERS':
      return order.status === 'ACCEPTED' && order.riderId === null && same(order.poolEnteredAt);
    case 'FOLLOW_UP_VENDOR':
      return order.status === 'CONFIRMED' && same(order.confirmedAt);
    case 'FOLLOW_UP_DELIVERY':
      return order.status === 'OUT_FOR_DELIVERY' && same(order.pickedUpAt);
  }
}

const ORDER_STATE_SELECT = { status: true, riderId: true, poolEnteredAt: true, confirmedAt: true, pickedUpAt: true } as const;

/** Marks OPEN suggestions whose order has moved on as EXPIRED. */
export async function expireStaleSuggestions(): Promise<number> {
  const open = await prisma.dispatchSuggestion.findMany({
    where: { status: 'OPEN' },
    select: { id: true, action: true, episode: true, order: { select: ORDER_STATE_SELECT } },
    take: 500
  });
  const stale = open.filter((s) => !stillApplies(s, s.order)).map((s) => s.id);
  if (stale.length === 0) return 0;
  const { count } = await prisma.dispatchSuggestion.updateMany({
    where: { id: { in: stale }, status: 'OPEN' },
    data: { status: 'EXPIRED', resolvedAt: new Date() }
  });
  return count;
}

const adminPanel = () => (process.env.ADMIN_PANEL_URL ?? 'https://4fgmpanel.4fgmonitor.com').replace(/\/$/, '');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One watcher pass. Returns the steps it newly recorded. */
export async function runDispatchTick(now = new Date()): Promise<PlannedStep[]> {
  await expireStaleSuggestions();
  const row = await getOrCreateSettings();
  const settings = settingsFrom(row);
  const plan = planDispatch({ now, settings, ...(await collect(now, settings, row.riderSharePercent)) });

  const created: PlannedStep[] = [];
  for (const p of plan) {
    const auto = p.action === 'NOTIFY_RIDERS';
    try {
      // The unique key is the claim: only the first tick to write it acts on it.
      await prisma.dispatchSuggestion.create({
        data: {
          orderId: p.orderId,
          action: p.action,
          title: p.title,
          reason: p.reason,
          episode: p.episode,
          payload: auto
            ? { notified: (p.payload?.riderUserIds as string[] | undefined)?.length ?? 0 }
            : ((p.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue),
          dedupeKey: p.dedupeKey,
          ...(auto ? { status: 'APPLIED', resolvedByName: 'Dispatch watcher', resolvedAt: now } : {})
        }
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
      throw err;
    }
    created.push(p);

    if (auto) {
      const ids = (p.payload?.riderUserIds as string[] | undefined) ?? [];
      const pay = Number(p.payload?.riderPay ?? 0);
      if (ids.length) {
        await notifyUsers(
          ids,
          'New job near you',
          `Pickup at ${String(p.payload?.vendorName ?? 'a vendor')}${pay > 0 ? `, you earn ₦${pay.toLocaleString('en-NG')}` : ''}. Open Jobs to take it.`,
          p.orderId
        );
      }
    }
  }

  const forPeople = created.filter((c) => c.action !== 'NOTIFY_RIDERS');
  if (forPeople.length) {
    const lines = [`<b>Dispatch: ${forPeople.length} new suggestion${forPeople.length === 1 ? '' : 's'}</b>`, ''];
    for (const c of forPeople.slice(0, 8)) lines.push(`• ${escapeHtml(c.title)}`);
    if (forPeople.length > 8) lines.push(`…and ${forPeople.length - 8} more`);
    lines.push('', `${adminPanel()}/dashboard/dispatch`);
    const err = await sendTelegram(lines.join('\n'));
    if (err && !err.startsWith('Telegram is not configured')) console.warn('[dispatch] Telegram post failed:', err);
  }
  return created;
}

let running = false;

/** Runs the watcher every minute. Assumes a single backend instance for no duplicate work (steps are de-duplicated either way). */
export function startDispatchWatcher(): void {
  if (process.env.DISPATCH_WATCHER_ENABLED === 'false') return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDispatchTick();
    } catch (err) {
      console.error('[dispatch] watcher pass failed', err);
    } finally {
      running = false;
    }
  };
  setInterval(tick, 60_000).unref();
}
