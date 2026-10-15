import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Prisma is mocked: these tests pin the route rules (ownership, plan cap, main
// branch protection, open orders), not the SQL — the migration is checked
// separately against a real Postgres engine.
const db = vi.hoisted(() => {
  const m: any = {
    vendorProfile: { findUnique: vi.fn() },
    branch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    order: { count: vi.fn() }
  };
  m.$transaction = vi.fn(async (arg: any) => (typeof arg === 'function' ? arg(m) : Promise.all(arg)));
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
  const { default: router } = await import('../src/routes/vendorBranches');
  const app = express();
  app.use(express.json());
  app.use('/branches', router);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/branches`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const vendor = { id: 'v1', userId: 'user-1', plan: 'GROWTH' }; // GROWTH allows 5
const valid = { name: 'Lekki', address: '1 Admiralty Way', phone: '0801' };
const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.vendorProfile.findUnique.mockResolvedValue(vendor);
});

describe('POST /branches', () => {
  it('creates the first branch as main', async () => {
    db.branch.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0); // active, hasMain
    db.branch.create.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));
    const res = await call('', 'POST', valid);
    expect(res.status).toBe(201);
    expect(db.branch.create.mock.calls[0][0].data).toMatchObject({ vendorId: 'v1', isMain: true });
  });

  it('does not make a later branch main', async () => {
    db.branch.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    db.branch.create.mockImplementation(async ({ data }: any) => ({ id: 'b2', ...data }));
    await call('', 'POST', valid);
    expect(db.branch.create.mock.calls[0][0].data.isMain).toBe(false);
  });

  it('refuses past the plan cap with BRANCH_LIMIT', async () => {
    db.branch.count.mockResolvedValueOnce(5);
    const res = await call('', 'POST', valid);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BRANCH_LIMIT');
    expect(db.branch.create).not.toHaveBeenCalled();
  });

  it('applies the cap of the vendor plan (BASIC = 1)', async () => {
    db.vendorProfile.findUnique.mockResolvedValue({ ...vendor, plan: 'BASIC' });
    db.branch.count.mockResolvedValueOnce(1);
    expect((await call('', 'POST', valid)).status).toBe(409);
  });

  it('rejects an invalid body and ignores client-sent vendorId / isMain', async () => {
    expect((await call('', 'POST', { name: '' })).status).toBe(400);
    db.branch.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    db.branch.create.mockImplementation(async ({ data }: any) => ({ id: 'b3', ...data }));
    await call('', 'POST', { ...valid, vendorId: 'someone-else', isMain: true });
    const data = db.branch.create.mock.calls[0][0].data;
    expect(data.vendorId).toBe('v1');
    expect(data.isMain).toBe(false);
  });

  it('turns a serialization conflict into a retryable 409', async () => {
    db.$transaction.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'P2034' }));
    const res = await call('', 'POST', valid);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('CONFLICT');
  });
});

describe('ownership', () => {
  it('404s when the branch belongs to another vendor', async () => {
    db.branch.findFirst.mockResolvedValue(null);
    for (const [path, method, body] of [
      ['/other', 'PATCH', { name: 'x' }],
      ['/other/make-main', 'POST'],
      ['/other/deactivate', 'POST'],
      ['/other/reactivate', 'POST']
    ] as const) {
      expect((await call(path, method, body)).status).toBe(404);
    }
    expect(db.branch.findFirst).toHaveBeenCalledWith({ where: { id: 'other', vendorId: 'v1' } });
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('404s for a user with no vendor profile', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(null);
    expect((await call('')).status).toBe(404);
  });
});

describe('deactivate', () => {
  const branch = { id: 'b2', vendorId: 'v1', isMain: false, isActive: true };

  it('refuses to close the main branch', async () => {
    db.branch.findFirst.mockResolvedValue({ ...branch, isMain: true });
    const res = await call('/b2/deactivate', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('IS_MAIN');
  });

  it('refuses while orders are in flight', async () => {
    db.branch.findFirst.mockResolvedValue(branch);
    db.order.count.mockResolvedValue(2);
    const res = await call('/b2/deactivate', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('OPEN_ORDERS');
    expect(db.order.count.mock.calls[0][0].where.status.in).toEqual(['PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY']);
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('closes (never deletes) a quiet non-main branch', async () => {
    db.branch.findFirst.mockResolvedValue(branch);
    db.order.count.mockResolvedValue(0);
    db.branch.update.mockResolvedValue({ ...branch, isActive: false });
    const res = await call('/b2/deactivate', 'POST');
    expect(res.status).toBe(200);
    expect(db.branch.update).toHaveBeenCalledWith({ where: { id: 'b2' }, data: { isActive: false } });
  });
});

describe('make-main / reactivate', () => {
  it('refuses a closed branch as main', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b2', vendorId: 'v1', isActive: false });
    expect((await call('/b2/make-main', 'POST')).status).toBe(400);
    expect(db.branch.updateMany).not.toHaveBeenCalled();
  });

  it('swaps main in one transaction', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b2', vendorId: 'v1', isActive: true });
    db.branch.updateMany.mockReturnValue(Promise.resolve({ count: 1 }));
    db.branch.update.mockReturnValue(Promise.resolve({}));
    db.branch.findUnique.mockResolvedValue({ id: 'b2', isMain: true });
    expect((await call('/b2/make-main', 'POST')).status).toBe(200);
    expect(db.branch.updateMany).toHaveBeenCalledWith({ where: { vendorId: 'v1', isMain: true }, data: { isMain: false } });
    expect(db.branch.update).toHaveBeenCalledWith({ where: { id: 'b2' }, data: { isMain: true } });
  });

  it('never lets the vendor reopen an admin-suspended branch', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b2', vendorId: 'v1', isActive: false, suspendedAt: new Date() });
    const res = await call('/b2/reactivate', 'POST');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('BRANCH_SUSPENDED');
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('refuses a suspended branch as main', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b2', vendorId: 'v1', isActive: true, suspendedAt: new Date() });
    expect((await call('/b2/make-main', 'POST')).status).toBe(400);
  });

  it('refuses to reopen a branch when the plan cap is already used', async () => {
    db.branch.findFirst.mockResolvedValue({ id: 'b2', vendorId: 'v1', isActive: false });
    db.branch.count.mockResolvedValue(5);
    const res = await call('/b2/reactivate', 'POST');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('BRANCH_LIMIT');
  });
});
