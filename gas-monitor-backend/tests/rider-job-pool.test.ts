import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => {
  const d: any = {
    user: { findUnique: vi.fn() },
    riderProfile: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    order: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    notification: { createMany: vi.fn() },
    pushToken: { findMany: vi.fn() },
    $queryRaw: vi.fn()
  };
  d.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(d));
  return d;
});
const earning = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/earnings', () => ({ recordEarningSafe: earning }));
vi.mock('../src/lib/settings', () => ({ getOrCreateSettings: async () => ({ riderSharePercent: 70, platformPickupAddress: '4FG depot' }) }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'u1', email: 'rider@example.com' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: rider } = await import('../src/routes/rider');
  const app = express();
  app.use(express.json());
  app.use('/rider', rider);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const rider = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  userId: 'u1',
  status: 'APPROVED',
  companyId: null,
  approvedViaCompany: false,
  company: null,
  isOnline: true,
  lat: 6.5,
  lng: 3.35,
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  db.riderProfile.findUnique.mockResolvedValue(rider());
  db.pushToken.findMany.mockResolvedValue([]);
  db.user.findUnique.mockResolvedValue({ name: 'Tunde' });
});

describe('online and the pool', () => {
  it('a pending rider cannot go online', async () => {
    db.riderProfile.findUnique.mockResolvedValue(rider({ status: 'PENDING' }));
    const res = await call('/rider/online', 'PATCH', { online: true });
    expect(res.status).toBe(403);
    expect(db.riderProfile.update).not.toHaveBeenCalled();
  });

  it('an offline rider sees no jobs and the pool is not read', async () => {
    db.riderProfile.findUnique.mockResolvedValue(rider({ isOnline: false }));
    db.order.findFirst.mockResolvedValue(null);
    const body = await (await call('/rider/jobs')).json();
    expect(body).toMatchObject({ online: false, approved: true, jobs: [] });
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('lists unclaimed accepted orders, never their own, without customer details', async () => {
    db.order.findFirst.mockResolvedValue(null);
    db.order.findMany.mockResolvedValue([
      {
        id: 'abcdef12-0000',
        supplierName: 'Gasco',
        cylinderSize: '12.5kg',
        quantity: 1,
        deliveryAddress: '5 Allen Avenue',
        deliveryFee: 1000,
        poolEnteredAt: new Date(),
        createdAt: new Date(),
        vendor: { businessName: 'Gasco', businessAddress: 'HQ' },
        branch: { name: 'Ikeja', address: '1 Obafemi Awolowo Way', city: 'Ikeja', lat: 6.6, lng: 3.35 }
      }
    ]);
    const body = await (await call('/rider/jobs')).json();
    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'ACCEPTED', riderId: null, consumerId: { not: 'u1' } });
    expect(where.OR).toEqual([{ vendorId: null }, { vendor: { userId: { not: 'u1' } } }]);
    expect(db.order.findMany.mock.calls[0][0].select.consumer).toBeUndefined();
    expect(body.jobs[0]).toMatchObject({ ref: 'ABCDEF12', pickupAddress: '1 Obafemi Awolowo Way', riderPay: 700 });
    expect(body.jobs[0].distanceKm).toBeCloseTo(11.1, 0);
  });
});

describe('taking a job', () => {
  it('must be online', async () => {
    db.riderProfile.findUnique.mockResolvedValue(rider({ isOnline: false }));
    const res = await call('/rider/jobs/o1/accept', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('GO_ONLINE');
  });

  it('one job at a time, checked under a lock on the rider row', async () => {
    db.order.count.mockResolvedValue(1);
    const res = await call('/rider/jobs/o1/accept', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('HAS_ACTIVE_JOB');
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('the second rider to tap gets JOB_TAKEN', async () => {
    db.order.count.mockResolvedValue(0);
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await call('/rider/jobs/o1/accept', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('JOB_TAKEN');
  });

  it('claims with a compare-and-set on riderId null and tells the customer', async () => {
    db.order.count.mockResolvedValue(0);
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', consumerId: 'c1', deliveryPin: '1234', consumer: { name: 'Ada', phone: '080' } });
    const res = await call('/rider/jobs/o1/accept', 'POST');
    expect(res.status).toBe(200);
    const arg = db.order.updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'o1', status: 'ACCEPTED', riderId: null });
    expect(arg.data.riderId).toBe('r1');
    const body = await res.json();
    expect(body.order.deliveryPin).toBeUndefined();
    expect(body.order.consumer.phone).toBe('080');
    expect(db.notification.createMany.mock.calls[0][0].data[0]).toMatchObject({ userId: 'c1', kind: 'ORDER', refId: 'o1' });
  });

  it('can give a job back before pickup only', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    expect((await call('/rider/jobs/o1/release', 'POST')).status).toBe(409);
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', consumerId: 'c1' });
    expect((await call('/rider/jobs/o1/release', 'POST')).status).toBe(200);
    const arg = db.order.updateMany.mock.calls[1][0];
    expect(arg.where).toEqual({ id: 'o1', riderId: 'r1', status: 'ACCEPTED' });
    expect(arg.data).toMatchObject({ riderId: null, assignedAt: null });
  });
});

describe('pickup and delivery', () => {
  const job = (status: string, over: Record<string, unknown> = {}) => ({
    id: 'o1', status, consumerId: 'c1', deliveryPin: '4821', pinLockedUntil: null, ...over
  });

  it('picks up only from ACCEPTED', async () => {
    db.order.findFirst.mockResolvedValue(job('CONFIRMED'));
    expect((await call('/rider/orders/o1', 'PATCH', { status: 'OUT_FOR_DELIVERY' })).status).toBe(409);

    db.order.findFirst.mockResolvedValue(job('ACCEPTED'));
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'OUT_FOR_DELIVERY', deliveryPin: '4821' });
    const res = await call('/rider/orders/o1', 'PATCH', { status: 'OUT_FOR_DELIVERY' });
    expect(res.status).toBe(200);
    expect((await res.json()).order.deliveryPin).toBeUndefined();
    expect(db.order.updateMany.mock.calls[0][0].where).toEqual({ id: 'o1', riderId: 'r1', status: 'ACCEPTED' });
  });

  it('delivery needs the PIN', async () => {
    db.order.findFirst.mockResolvedValue(job('OUT_FOR_DELIVERY'));
    const res = await call('/rider/orders/o1', 'PATCH', { status: 'DELIVERED' });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('PIN_REQUIRED');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('a wrong PIN counts an attempt; the fifth locks the order', async () => {
    db.order.findFirst.mockResolvedValue(job('OUT_FOR_DELIVERY'));
    db.order.update.mockResolvedValueOnce({ pinAttempts: 1 });
    let res = await call('/rider/orders/o1', 'PATCH', { status: 'DELIVERED', pin: '0000' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'WRONG_PIN', attemptsLeft: 4 });

    db.order.update.mockResolvedValueOnce({ pinAttempts: 5 }).mockResolvedValueOnce({});
    res = await call('/rider/orders/o1', 'PATCH', { status: 'DELIVERED', pin: '0000' });
    expect(res.status).toBe(429);
    expect(db.order.update.mock.calls[2][0].data.pinLockedUntil).toBeInstanceOf(Date);
    expect(db.order.updateMany).not.toHaveBeenCalled();
    expect(earning).not.toHaveBeenCalled();
  });

  it('a locked order refuses even the right PIN until the lock ends', async () => {
    db.order.findFirst.mockResolvedValue(job('OUT_FOR_DELIVERY', { pinLockedUntil: new Date(Date.now() + 60_000) }));
    const res = await call('/rider/orders/o1', 'PATCH', { status: 'DELIVERED', pin: '4821' });
    expect(res.status).toBe(429);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('the right PIN delivers with a compare-and-set and records earnings', async () => {
    db.order.findFirst.mockResolvedValue(job('OUT_FOR_DELIVERY', { pinLockedUntil: new Date(Date.now() - 1000) }));
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'DELIVERED' });
    const res = await call('/rider/orders/o1', 'PATCH', { status: 'DELIVERED', pin: '4821' });
    expect(res.status).toBe(200);
    const arg = db.order.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'o1', riderId: 'r1', status: 'OUT_FOR_DELIVERY' });
    expect(arg.data).toMatchObject({ status: 'DELIVERED', pinAttempts: 0, pinLockedUntil: null });
    expect(earning).toHaveBeenCalledWith('o1');
  });
});
