import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => {
  const m: any = {
    user: { findUnique: vi.fn() },
    riderProfile: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    fleetInvite: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn()
    },
    logisticsCompany: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    order: { findMany: vi.fn() }
  };
  m.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(m) : Promise.all(arg)));
  return m;
});

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'co-user', email: 'boss@swift.com' };
    next();
  }
}));

import { ASSIGNABLE_RIDER, claimFleetInvite, effectiveRiderStatus, removeFromFleet } from '../src/lib/fleet';

beforeEach(() => {
  vi.clearAllMocks();
  db.fleetInvite.updateMany.mockResolvedValue({ count: 1 });
  db.riderProfile.update.mockResolvedValue({});
  db.fleetInvite.update.mockReturnValue(Promise.resolve({}));
});

const verified = { id: 'u-rider', email: 'Rider@Example.com', emailVerified: true };
const invite = { id: 'i1', companyId: 'co1' };

describe('effectiveRiderStatus', () => {
  it('is the stored status for an independent rider', () => {
    expect(effectiveRiderStatus({ status: 'APPROVED', companyId: null, approvedViaCompany: false })).toBe('APPROVED');
    expect(effectiveRiderStatus({ status: 'PENDING' })).toBe('PENDING');
    expect(effectiveRiderStatus({ status: 'REJECTED' })).toBe('REJECTED');
  });

  it('follows the company: approved only while the company is', () => {
    const r = { status: 'APPROVED' as const, companyId: 'co1', approvedViaCompany: true };
    expect(effectiveRiderStatus({ ...r, company: { status: 'APPROVED' } })).toBe('APPROVED');
    expect(effectiveRiderStatus({ ...r, company: { status: 'REJECTED' } })).toBe('PENDING');
    expect(effectiveRiderStatus({ ...r, company: { status: 'PENDING' } })).toBe('PENDING');
  });

  it('a rider whose company is gone loses fleet-granted approval', () => {
    expect(effectiveRiderStatus({ status: 'APPROVED', companyId: null, approvedViaCompany: true })).toBe('PENDING');
  });

  it('assignable filter: approved, and either independent or in an approved fleet', () => {
    expect(ASSIGNABLE_RIDER).toEqual({
      status: 'APPROVED',
      OR: [{ companyId: null, approvedViaCompany: false }, { company: { status: 'APPROVED' } }]
    });
  });
});

describe('claimFleetInvite', () => {
  it('does nothing for an unverified email', async () => {
    expect(await claimFleetInvite({ ...verified, emailVerified: false })).toBe(false);
    expect(db.riderProfile.findUnique).not.toHaveBeenCalled();
  });

  it('needs a rider profile first', async () => {
    db.riderProfile.findUnique.mockResolvedValue(null);
    expect(await claimFleetInvite(verified)).toBe(false);
    expect(db.fleetInvite.findFirst).not.toHaveBeenCalled();
  });

  it("never overrides an admin's rejection", async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'REJECTED', companyId: null });
    expect(await claimFleetInvite(verified)).toBe(false);
    expect(db.fleetInvite.findFirst).not.toHaveBeenCalled();
  });

  it('only matches a live invite from an APPROVED company, case-insensitively', async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(null);
    await claimFleetInvite(verified);
    const where = db.fleetInvite.findFirst.mock.calls[0][0].where;
    expect(where.email).toEqual({ equals: 'Rider@Example.com', mode: 'insensitive' });
    expect(where.status).toBe('INVITED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
    expect(where.company).toEqual({ status: 'APPROVED' });
  });

  it('approves a PENDING rider by joining, flagging it as company-granted', async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    expect(await claimFleetInvite(verified)).toBe(true);
    expect(db.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rp' },
      data: { companyId: 'co1', status: 'APPROVED', approvedViaCompany: true }
    });
  });

  it('an already-approved independent rider just gains the link', async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'APPROVED', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    await claimFleetInvite(verified);
    expect(db.riderProfile.update).toHaveBeenCalledWith({ where: { id: 'rp' }, data: { companyId: 'co1' } });
  });

  it('leaves a rider who is already in another fleet alone', async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'APPROVED', companyId: 'other' });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    expect(await claimFleetInvite(verified)).toBe(false);
    expect(db.fleetInvite.updateMany).not.toHaveBeenCalled();
  });

  it('loses the race cleanly: a second claim of the same invite does nothing', async () => {
    db.riderProfile.findUnique.mockResolvedValue({ id: 'rp', status: 'PENDING', companyId: null });
    db.fleetInvite.findFirst.mockResolvedValue(invite);
    db.fleetInvite.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimFleetInvite(verified)).toBe(false);
    expect(db.riderProfile.update).not.toHaveBeenCalled();
  });
});

describe('removeFromFleet', () => {
  it('sends a company-approved rider back to PENDING', async () => {
    db.riderProfile.findFirst.mockResolvedValue({ id: 'rp', approvedViaCompany: true });
    await removeFromFleet('co1', { id: 'i1', userId: 'u1' });
    expect(db.fleetInvite.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { status: 'REVOKED' } });
    expect(db.riderProfile.update).toHaveBeenCalledWith({
      where: { id: 'rp' },
      data: { companyId: null, status: 'PENDING', approvedViaCompany: false }
    });
  });

  it('lets an independently-approved rider keep working', async () => {
    db.riderProfile.findFirst.mockResolvedValue({ id: 'rp', approvedViaCompany: false });
    await removeFromFleet('co1', { id: 'i1', userId: 'u1' });
    expect(db.riderProfile.update).toHaveBeenCalledWith({ where: { id: 'rp' }, data: { companyId: null } });
  });

  it("only touches a rider that is in this company's fleet", async () => {
    db.riderProfile.findFirst.mockResolvedValue(null);
    await removeFromFleet('co1', { id: 'i1', userId: 'u1' });
    expect(db.riderProfile.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', companyId: 'co1' } });
    expect(db.riderProfile.update).not.toHaveBeenCalled();
  });
});

describe('company routes', () => {
  let server: Server;
  let base: string;
  const company = { id: 'co1', userId: 'co-user', status: 'APPROVED' };

  beforeAll(async () => {
    const { default: router } = await import('../src/routes/company');
    const app = express();
    app.use(express.json());
    app.use('/company', router);
    app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/company`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const call = (path: string, method = 'GET', body?: unknown) =>
    fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ role: 'LOGISTICS_COMPANY', emailVerified: true, isSuspended: false });
    db.logisticsCompany.findUnique.mockResolvedValue(company);
  });

  it.each([
    ['a rider', { role: 'RIDER', emailVerified: true, isSuspended: false }],
    ['a vendor', { role: 'VENDOR', emailVerified: true, isSuspended: false }],
    ['an unverified account', { role: 'LOGISTICS_COMPANY', emailVerified: false, isSuspended: false }],
    ['a suspended account', { role: 'LOGISTICS_COMPANY', emailVerified: true, isSuspended: true }]
  ])('403s %s', async (_n, user) => {
    db.user.findUnique.mockResolvedValue(user);
    expect((await call('/riders')).status).toBe(403);
    expect(db.riderProfile.findMany).not.toHaveBeenCalled();
  });

  it('lets a PENDING company finish its profile but not touch the fleet', async () => {
    db.logisticsCompany.findUnique.mockResolvedValue({ ...company, status: 'PENDING' });
    db.logisticsCompany.upsert.mockResolvedValue({ id: 'co1' });
    expect((await call('/profile', 'POST', { companyName: 'Swift', address: '1 Road', phone: '080' })).status).toBe(201);
    for (const [p, m, b] of [['/riders', 'GET'], ['/riders/invite', 'POST', { email: 'a@b.co' }], ['/deliveries', 'GET']] as const) {
      const res = await call(p, m, b);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('COMPANY_NOT_APPROVED');
    }
  });

  it('cannot approve itself through the profile route', async () => {
    db.logisticsCompany.upsert.mockResolvedValue({ id: 'co1' });
    await call('/profile', 'POST', { companyName: 'Swift', address: '1 Road', phone: '080', status: 'APPROVED' });
    const arg = db.logisticsCompany.upsert.mock.calls[0][0];
    expect(arg.create.status).toBeUndefined();
    expect(arg.update.status).toBeUndefined();
  });

  it('scopes the fleet list to its own company id', async () => {
    db.riderProfile.findMany.mockResolvedValue([]);
    db.fleetInvite.findMany.mockResolvedValue([]);
    await call('/riders');
    expect(db.riderProfile.findMany.mock.calls[0][0].where).toEqual({ companyId: 'co1' });
    expect(db.fleetInvite.findMany.mock.calls[0][0].where).toEqual({ companyId: 'co1', status: 'INVITED' });
  });

  it('lower-cases invites, and refuses a rider already in the fleet', async () => {
    db.fleetInvite.findUnique.mockResolvedValue(null);
    db.fleetInvite.count.mockResolvedValue(0);
    db.fleetInvite.upsert.mockResolvedValue({ id: 'i1' });
    expect((await call('/riders/invite', 'POST', { email: ' New@Rider.COM ' })).status).toBe(201);
    expect(db.fleetInvite.upsert.mock.calls[0][0].create.email).toBe('new@rider.com');

    db.fleetInvite.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    expect((await call('/riders/invite', 'POST', { email: 'x@y.co' })).status).toBe(409);
  });

  it('enforces the fleet size cap', async () => {
    db.fleetInvite.findUnique.mockResolvedValue(null);
    db.fleetInvite.count.mockResolvedValue(200);
    const res = await call('/riders/invite', 'POST', { email: 'x@y.co' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('FLEET_LIMIT');
  });

  it("404s removing a rider from someone else's fleet", async () => {
    db.riderProfile.findFirst.mockResolvedValue(null);
    expect((await call('/riders/rp9', 'DELETE')).status).toBe(404);
    expect(db.riderProfile.findFirst).toHaveBeenCalledWith({ where: { id: 'rp9', companyId: 'co1' } });
    expect(db.riderProfile.update).not.toHaveBeenCalled();
  });

  it('only withdraws a pending invite of its own', async () => {
    db.fleetInvite.findFirst.mockResolvedValue(null);
    expect((await call('/invites/i9', 'DELETE')).status).toBe(404);
    expect(db.fleetInvite.findFirst).toHaveBeenCalledWith({ where: { id: 'i9', companyId: 'co1', status: 'INVITED' } });
  });

  it('deliveries are fleet-scoped and never expose customer contact details', async () => {
    db.order.findMany.mockResolvedValue([]);
    await call('/deliveries');
    const arg = db.order.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ rider: { companyId: 'co1' } });
    expect(arg.select.consumer.select).toEqual({ name: true });
  });
});
