import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma', () => ({ prisma: {} }));

const { planDispatch, ridersNear, stillApplies } = await import('../src/lib/dispatchWatcher');

const settings = { notifyAfterMin: 2, assignAfterMin: 15, cancelAfterMin: 45, radiusKm: 10, vendorStallMin: 15, deliveryStallMin: 120 };
const now = new Date('2026-11-25T10:00:00Z');
const ago = (min: number) => new Date(now.getTime() - min * 60_000);

const poolOrder = (waited: number, over: Record<string, unknown> = {}) => ({
  id: 'order-0001',
  vendorName: 'Gasco',
  riderPay: 700,
  episode: ago(waited),
  pickup: { lat: 6.6, lng: 3.35 },
  excludeUserIds: ['customer'],
  ...over
});

const riders = [
  { riderId: 'far', userId: 'u-far', name: 'Far', busy: false, location: { lat: 6.65, lng: 3.35 } }, // ~5.6 km
  { riderId: 'near', userId: 'u-near', name: 'Near', busy: false, location: { lat: 6.61, lng: 3.35 } }, // ~1.1 km
  { riderId: 'busy', userId: 'u-busy', name: 'Busy', busy: true, location: { lat: 6.6, lng: 3.35 } },
  { riderId: 'away', userId: 'u-away', name: 'Away', busy: false, location: { lat: 7.5, lng: 3.35 } }, // ~100 km
  { riderId: 'self', userId: 'customer', name: 'Self', busy: false, location: { lat: 6.6, lng: 3.35 } }
];

const plan = (pool: ReturnType<typeof poolOrder>[], extra: Partial<Parameters<typeof planDispatch>[0]> = {}) =>
  planDispatch({ now, settings, pool, candidates: riders, stalledVendors: [], stalledDeliveries: [], ...extra });

describe('ridersNear', () => {
  it('idle riders in range, nearest first, never the customer', () => {
    expect(ridersNear(poolOrder(0), riders, 10).map((r) => r.riderId)).toEqual(['near', 'far']);
  });

  it('keeps riders with no known location, after the known ones', () => {
    const list = [...riders, { riderId: 'unknown', userId: 'u-x', name: 'X', busy: false, location: null }];
    expect(ridersNear(poolOrder(0), list, 10).map((r) => r.riderId)).toEqual(['near', 'far', 'unknown']);
  });
});

describe('planDispatch', () => {
  it('does nothing before the first threshold', () => {
    expect(plan([poolOrder(1)])).toEqual([]);
  });

  it('alerts riders first, then suggests the nearest idle rider, then cancelling', () => {
    expect(plan([poolOrder(3)]).map((p) => p.action)).toEqual(['NOTIFY_RIDERS']);
    const notify = plan([poolOrder(3)])[0];
    expect(notify.payload?.riderUserIds).toEqual(['u-near', 'u-far']);

    const mid = plan([poolOrder(20)]);
    expect(mid.map((p) => p.action)).toEqual(['NOTIFY_RIDERS', 'ASSIGN_RIDER']);
    expect(mid[1].payload).toMatchObject({ riderId: 'near' });

    expect(plan([poolOrder(50)]).map((p) => p.action)).toEqual(['NOTIFY_RIDERS', 'ASSIGN_RIDER', 'CANCEL_ORDER']);
  });

  it('no assign suggestion when nobody idle is nearby', () => {
    expect(plan([poolOrder(50)], { candidates: [riders[2]] }).map((p) => p.action)).toEqual(['NOTIFY_RIDERS', 'CANCEL_ORDER']);
  });

  it('dedupe keys are per action, order and episode', () => {
    const [a] = plan([poolOrder(3)]);
    const [b] = plan([poolOrder(3, { episode: ago(4) })]);
    expect(a.dedupeKey).toBe(`NOTIFY_RIDERS:order-0001:${ago(3).getTime()}`);
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });

  it('flags vendors who have not accepted and deliveries that stalled', () => {
    const out = plan([], {
      stalledVendors: [{ id: 'v-order', episode: ago(20), contactName: 'Gasco', phone: '080' }],
      stalledDeliveries: [{ id: 'd-order', episode: ago(130), contactName: 'Tunde', phone: null }]
    });
    expect(out.map((p) => p.action)).toEqual(['FOLLOW_UP_VENDOR', 'FOLLOW_UP_DELIVERY']);
  });
});

describe('stillApplies', () => {
  const episode = ago(20);
  const order = { status: 'ACCEPTED', riderId: null, poolEnteredAt: episode, confirmedAt: null, pickedUpAt: null };

  it('a pool suggestion holds only while the same wait goes on', () => {
    expect(stillApplies({ action: 'ASSIGN_RIDER', episode }, order)).toBe(true);
    expect(stillApplies({ action: 'ASSIGN_RIDER', episode }, { ...order, riderId: 'r1' })).toBe(false);
    expect(stillApplies({ action: 'ASSIGN_RIDER', episode }, { ...order, poolEnteredAt: ago(1) })).toBe(false);
    expect(stillApplies({ action: 'CANCEL_ORDER', episode }, { ...order, status: 'CANCELLED' })).toBe(false);
    expect(stillApplies({ action: 'ASSIGN_RIDER', episode }, null)).toBe(false);
  });

  it('a vendor follow-up ends once the vendor accepts', () => {
    const paid = { ...order, status: 'CONFIRMED', poolEnteredAt: null, confirmedAt: episode };
    expect(stillApplies({ action: 'FOLLOW_UP_VENDOR', episode }, paid)).toBe(true);
    expect(stillApplies({ action: 'FOLLOW_UP_VENDOR', episode }, { ...paid, status: 'ACCEPTED' })).toBe(false);
  });
});
