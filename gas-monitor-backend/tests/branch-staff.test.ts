import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  branch: { findFirst: vi.fn(), findMany: vi.fn() },
  branchStaff: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn()
  },
  order: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  gasListing: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  riderProfile: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }
}));
const earning = vi.hoisted(() => vi.fn());
let authedUser = { sub: 'm1', email: 'mgr@example.com' };

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/earnings', () => ({ recordEarningSafe: earning }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = authedUser;
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: staff } = await import('../src/routes/staff');
  const { default: branches } = await import('../src/routes/vendorBranches');
  const app = express();
  app.use(express.json());
  app.use('/staff', staff);
  app.use('/branches', branches);
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

const manager = { id: 'm1', email: 'mgr@example.com', role: 'BRANCH_MANAGER', emailVerified: true, isSuspended: false };

beforeEach(() => {
  vi.clearAllMocks();
  authedUser = { sub: 'm1', email: 'mgr@example.com' };
  db.user.findUnique.mockResolvedValue(manager);
  db.branchStaff.updateMany.mockResolvedValue({ count: 0 });
  db.branchStaff.findMany.mockResolvedValue([{ branchId: 'b1' }]); // manager staffs b1 only
});

describe('manager gate', () => {
  it.each([
    ['a vendor', { ...manager, role: 'VENDOR' }],
    ['a consumer', { ...manager, role: 'CONSUMER' }],
    ['an unverified account', { ...manager, emailVerified: false }],
    ['a suspended account', { ...manager, isSuspended: true }],
    ['a missing user', null]
  ])('403s %s', async (_n, user) => {
    db.user.findUnique.mockResolvedValue(user);
    expect((await call('/staff/orders')).status).toBe(403);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('claims pending invites for the verified email before resolving access', async () => {
    db.branch.findMany.mockResolvedValue([]);
    await call('/staff/me');
    const where = db.branchStaff.updateMany.mock.calls[0][0].where;
    expect(where.email).toEqual({ equals: 'mgr@example.com', mode: 'insensitive' });
    expect(where.status).toBe('INVITED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date); // expired invites do not claim
  });

  it('does not claim for an unverified email', async () => {
    db.user.findUnique.mockResolvedValue({ ...manager, emailVerified: false });
    await call('/staff/me');
    expect(db.branchStaff.updateMany).not.toHaveBeenCalled();
  });
});

describe('branch scoping', () => {
  it('lists orders only for managed branches', async () => {
    db.order.findMany.mockResolvedValue([]);
    await call('/staff/orders');
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({ branchId: { in: ['b1'] } });
  });

  it("404s when asking for a branch they don't manage", async () => {
    expect((await call('/staff/orders?branchId=b9')).status).toBe(404);
    expect((await call('/staff/listings?branchId=b9')).status).toBe(404);
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.gasListing.findMany).not.toHaveBeenCalled();
  });

  it('never selects the customer email', async () => {
    db.order.findMany.mockResolvedValue([]);
    await call('/staff/orders');
    expect(db.order.findMany.mock.calls[0][0].include.consumer.select).toEqual({ id: true, name: true, phone: true });
  });

  it('a manager with no branches sees nothing', async () => {
    db.branchStaff.findMany.mockResolvedValue([]);
    db.order.findMany.mockResolvedValue([]);
    await call('/staff/orders');
    expect(db.order.findMany.mock.calls[0][0].where).toEqual({ branchId: { in: [] } });
  });
});

describe('order status', () => {
  const order = (status: string) => ({ id: 'o1', branchId: 'b1', status });

  it("404s on another branch's order (lookup is scoped)", async () => {
    db.order.findFirst.mockResolvedValue(null);
    expect((await call('/staff/orders/o1', 'PATCH', { status: 'DELIVERED' })).status).toBe(404);
    expect(db.order.findFirst.mock.calls[0][0].where).toEqual({ id: 'o1', branchId: { in: ['b1'] } });
  });

  it('cannot touch an unpaid (PENDING) order', async () => {
    db.order.findFirst.mockResolvedValue(order('PENDING'));
    const res = await call('/staff/orders/o1', 'PATCH', { status: 'DELIVERED' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('INVALID_STATUS_TRANSITION');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('cannot reopen a delivered or cancelled order', async () => {
    for (const s of ['DELIVERED', 'CANCELLED']) {
      db.order.findFirst.mockResolvedValue(order(s));
      expect((await call('/staff/orders/o1', 'PATCH', { status: 'OUT_FOR_DELIVERY' })).status).toBe(409);
    }
  });

  it('cannot set CONFIRMED (payment does that) or an unknown status', async () => {
    expect((await call('/staff/orders/o1', 'PATCH', { status: 'CONFIRMED' })).status).toBe(400);
    expect((await call('/staff/orders/o1', 'PATCH', { status: 'PENDING' })).status).toBe(400);
  });

  it('delivers a confirmed order with compare-and-set and records the earning', async () => {
    db.order.findFirst.mockResolvedValue(order('CONFIRMED'));
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'DELIVERED' });
    const res = await call('/staff/orders/o1', 'PATCH', { status: 'DELIVERED' });
    expect(res.status).toBe(200);
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', status: 'CONFIRMED' },
      data: { status: 'DELIVERED' }
    });
    expect(earning).toHaveBeenCalledWith('o1');
  });

  it('409s when the order changed under them, without recording an earning', async () => {
    db.order.findFirst.mockResolvedValue(order('CONFIRMED'));
    db.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await call('/staff/orders/o1', 'PATCH', { status: 'DELIVERED' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STALE');
    expect(earning).not.toHaveBeenCalled();
  });
});

describe('rider assignment and stock', () => {
  it('only assigns approved riders on in-scope orders', async () => {
    db.order.findFirst.mockResolvedValue({ id: 'o1', branchId: 'b1' });
    db.riderProfile.findFirst.mockResolvedValue(null); // not in the assignable set
    expect((await call('/staff/orders/o1/rider', 'PATCH', { riderId: 'r1' })).status).toBe(400);
    expect(db.order.update).not.toHaveBeenCalled();
    // The lookup goes through the shared filter (approved, and company approved if in a fleet).
    const where = db.riderProfile.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'r1', status: 'APPROVED' });
    expect(where.OR).toHaveLength(2);
  });

  it('stock toggle writes inStock only, ignoring price and branch', async () => {
    db.gasListing.findFirst.mockResolvedValue({ id: 'l1', branchId: 'b1' });
    db.gasListing.update.mockResolvedValue({ id: 'l1' });
    await call('/staff/listings/l1', 'PATCH', { inStock: false, pricePerKg: 1, branchId: 'b9' });
    expect(db.gasListing.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { inStock: false } });
  });

  it("404s on another branch's listing", async () => {
    db.gasListing.findFirst.mockResolvedValue(null);
    expect((await call('/staff/listings/l9', 'PATCH', { inStock: true })).status).toBe(404);
    expect(db.gasListing.update).not.toHaveBeenCalled();
  });
});

describe('owner invites', () => {
  beforeEach(() => {
    authedUser = { sub: 'owner', email: 'owner@example.com' };
    db.vendorProfile.findUnique.mockResolvedValue({ id: 'v1', userId: 'owner', plan: 'GROWTH' });
    db.branch.findFirst.mockResolvedValue({ id: 'b1', vendorId: 'v1' });
  });

  it("404s for a branch the vendor doesn't own", async () => {
    db.branch.findFirst.mockResolvedValue(null);
    expect((await call('/branches/b9/staff', 'POST', { email: 'x@example.com' })).status).toBe(404);
    expect((await call('/branches/b9/staff')).status).toBe(404);
    expect(db.branchStaff.upsert).not.toHaveBeenCalled();
    expect(db.branch.findFirst).toHaveBeenCalledWith({ where: { id: 'b9', vendorId: 'v1' } });
  });

  it('lower-cases the email and creates an expiring invite', async () => {
    db.branchStaff.findUnique.mockResolvedValue(null);
    db.branchStaff.count.mockResolvedValue(0);
    db.branchStaff.upsert.mockResolvedValue({ id: 's1' });
    const res = await call('/branches/b1/staff', 'POST', { email: '  New.Mgr@Example.COM ' });
    expect(res.status).toBe(201);
    const arg = db.branchStaff.upsert.mock.calls[0][0];
    expect(arg.create.email).toBe('new.mgr@example.com');
    expect(arg.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects inviting the owner's own email and bad emails", async () => {
    expect((await call('/branches/b1/staff', 'POST', { email: 'OWNER@example.com' })).status).toBe(400);
    expect((await call('/branches/b1/staff', 'POST', { email: 'nope' })).status).toBe(400);
  });

  it('409s for someone already managing the branch', async () => {
    db.branchStaff.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    expect((await call('/branches/b1/staff', 'POST', { email: 'a@example.com' })).status).toBe(409);
    expect(db.branchStaff.upsert).not.toHaveBeenCalled();
  });

  it('enforces the per-branch staff cap', async () => {
    db.branchStaff.findUnique.mockResolvedValue(null);
    db.branchStaff.count.mockResolvedValue(10);
    const res = await call('/branches/b1/staff', 'POST', { email: 'a@example.com' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('STAFF_LIMIT');
  });

  it('revokes (keeps the row) and only within the owned branch', async () => {
    db.branchStaff.findFirst.mockResolvedValue({ id: 's1' });
    db.branchStaff.update.mockResolvedValue({});
    expect((await call('/branches/b1/staff/s1', 'DELETE')).status).toBe(200);
    expect(db.branchStaff.findFirst).toHaveBeenCalledWith({ where: { id: 's1', branchId: 'b1' } });
    expect(db.branchStaff.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { status: 'REVOKED' } });
  });

  it('404s revoking a staff row from another branch', async () => {
    db.branchStaff.findFirst.mockResolvedValue(null);
    expect((await call('/branches/b1/staff/other', 'DELETE')).status).toBe(404);
    expect(db.branchStaff.update).not.toHaveBeenCalled();
  });
});
