import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => {
  const m: any = {
    vendorProfile: { upsert: vi.fn() },
    branch: { findFirst: vi.fn(), create: vi.fn((a: any) => ({ __create: a.data })) }
  };
  m.$transaction = vi.fn(async (ops: any[]) => Promise.all(ops));
  return m;
});

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'user-1', email: 'v@example.com' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: router } = await import('../src/routes/vendor');
  const app = express();
  app.use(express.json());
  app.use('/vendor', router);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/vendor`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const profileRow = {
  id: 'v1',
  userId: 'user-1',
  businessName: 'Solo Gas',
  businessAddress: '1 Market Road',
  state: 'Lagos',
  city: 'Ikeja',
  phone: '0801',
  lat: 6.6,
  lng: 3.3
};

const post = (body: unknown) =>
  fetch(base + '/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const solo = { businessName: 'Solo Gas', businessAddress: '1 Market Road', phone: '0801' };

beforeEach(() => {
  vi.clearAllMocks();
  db.vendorProfile.upsert.mockResolvedValue(profileRow);
  db.branch.findFirst.mockResolvedValue(null); // no main branch yet
});

describe('single-location vendor sign-up (no branches)', () => {
  it('succeeds with no `branches` field at all (older apps, web-v2)', async () => {
    const res = await post(solo);
    expect(res.status).toBe(201);
    expect(db.branch.create).toHaveBeenCalledTimes(1);
  });

  it('succeeds with an empty `branches` array (what the new app sends)', async () => {
    expect((await post({ ...solo, branches: [] })).status).toBe(201);
    expect(db.branch.create).toHaveBeenCalledTimes(1);
  });

  it('creates exactly one main branch from the business location', async () => {
    await post(solo);
    expect(db.branch.create.mock.calls[0][0].data).toEqual({
      vendorId: 'v1',
      name: 'Main branch',
      address: '1 Market Road',
      state: 'Lagos',
      city: 'Ikeja',
      lat: 6.6,
      lng: 3.3,
      phone: '0801',
      isMain: true
    });
  });

  it('still works for a legacy client that sends no state, city or coordinates', async () => {
    db.vendorProfile.upsert.mockResolvedValue({ ...profileRow, state: null, city: null, lat: null, lng: null });
    expect((await post(solo)).status).toBe(201);
    expect(db.branch.create.mock.calls[0][0].data).toMatchObject({ state: null, city: null, isMain: true });
  });

  it('never trips the branch cap with no extras (main branch alone is 1 of 5)', async () => {
    const res = await post(solo);
    expect(res.status).toBe(201);
  });

  it('only the extras count against the cap: 4 extras fit, 5 do not', async () => {
    const extra = (n: number) => ({ name: `B${n}`, address: 'x', phone: '1' });
    const four = await post({ ...solo, branches: [1, 2, 3, 4].map(extra) });
    expect(four.status).toBe(201);
    expect(db.branch.create).toHaveBeenCalledTimes(5); // main + 4

    db.branch.create.mockClear();
    const five = await post({ ...solo, branches: [1, 2, 3, 4, 5].map(extra) });
    expect(five.status).toBe(400);
    expect((await five.json()).code).toBe('BRANCH_LIMIT');
    expect(db.branch.create).not.toHaveBeenCalled();
  });

  it('re-posting the profile does not create a second main branch', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b1', isMain: true });
    expect((await post(solo)).status).toBe(201);
    expect(db.branch.create).not.toHaveBeenCalled();
  });

  it('still rejects a genuinely invalid profile', async () => {
    expect((await post({ businessName: '', businessAddress: 'x', phone: '1' })).status).toBe(400);
    expect(db.vendorProfile.upsert).not.toHaveBeenCalled();
  });
});
