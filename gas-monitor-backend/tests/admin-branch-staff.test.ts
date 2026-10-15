import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  branchStaff: { findMany: vi.fn(), count: vi.fn() }
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/middleware/requireAdmin', () => ({
  requireAdmin: (req: any, _res: any, next: any) => {
    req.admin = { adminId: 'a1', name: 'Support', username: 's@example.com', role: 'SUPPORT' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: router } = await import('../src/routes/admin/branchStaff');
  const app = express();
  app.use('/staff', router);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/staff`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const row = (over: object) => ({
  id: 's1',
  email: 'm@example.com',
  status: 'ACTIVE',
  expiresAt: new Date(Date.now() + 86_400_000),
  createdAt: new Date(),
  updatedAt: new Date(),
  user: { id: 'u1', name: 'Mgr', isSuspended: false, emailVerified: true },
  branch: { id: 'b1', name: 'Lekki', vendor: { id: 'v1', businessName: 'Acme' } },
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  db.branchStaff.count.mockResolvedValue(0);
  db.branchStaff.findMany.mockResolvedValue([]);
});

const where = () => db.branchStaff.findMany.mock.calls[0][0].where;

describe('GET /admin/branch-staff', () => {
  it('lists with pagination and no filters by default', async () => {
    db.branchStaff.findMany.mockResolvedValue([row({})]);
    db.branchStaff.count.mockResolvedValue(1);
    const body = await (await fetch(base)).json();
    expect(body.pagination.total).toBe(1);
    expect(where()).toEqual({});
  });

  it('shows an invite past its expiry as EXPIRED, but not an active row', async () => {
    const past = new Date(Date.now() - 1000);
    db.branchStaff.findMany.mockResolvedValue([
      row({ id: 'a', status: 'INVITED', expiresAt: past, user: null }),
      row({ id: 'b', status: 'INVITED' }),
      row({ id: 'c', status: 'ACTIVE', expiresAt: past })
    ]);
    const { data } = await (await fetch(base)).json();
    expect(data.map((r: any) => r.displayStatus)).toEqual(['EXPIRED', 'INVITED', 'ACTIVE']);
  });

  it('filters EXPIRED and INVITED by expiry, not just status', async () => {
    await fetch(`${base}?status=EXPIRED`);
    expect(where().AND[0]).toMatchObject({ status: 'INVITED', expiresAt: { lte: expect.any(Date) } });
    db.branchStaff.findMany.mockClear();
    await fetch(`${base}?status=INVITED`);
    expect(where().AND[0]).toMatchObject({ status: 'INVITED', expiresAt: { gt: expect.any(Date) } });
  });

  it('ignores an unknown status instead of passing it to Prisma', async () => {
    await fetch(`${base}?status=DROP`);
    expect(where()).toEqual({});
  });

  it('searches manager, branch and business', async () => {
    await fetch(`${base}?q=acme`);
    const or = where().AND[0].OR;
    expect(or).toHaveLength(4);
    expect(JSON.stringify(or)).toContain('businessName');
  });

  it('whitelists the sort field', async () => {
    await fetch(`${base}?sort=password&dir=asc`);
    expect(db.branchStaff.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
  });

  it('never selects the password hash or tokens from the user', async () => {
    await fetch(base);
    const userSelect = db.branchStaff.findMany.mock.calls[0][0].select.user.select;
    expect(Object.keys(userSelect).sort()).toEqual(['emailVerified', 'id', 'isSuspended', 'name']);
  });
});
