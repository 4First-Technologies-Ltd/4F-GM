import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  branch: { findFirst: vi.fn(), update: vi.fn() },
  order: { count: vi.fn() }
}));
const audit = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/audit', () => ({ writeAuditLog: audit }));
vi.mock('../src/middleware/requireAdmin', () => {
  const pass = (req: any, _res: any, next: any) => {
    req.admin = { adminId: 'a1', name: 'Ops', username: 'ops@example.com', role: 'OPERATIONS' };
    next();
  };
  return { requireAdmin: pass, requireOperations: pass, requireSuperAdmin: pass };
});

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: router } = await import('../src/routes/admin/vendors');
  const app = express();
  app.use(express.json());
  app.use('/vendors', router);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/vendors`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body: unknown = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const branch = { id: 'b1', name: 'Lekki', isMain: false, suspendedAt: null, suspendedReason: null, vendor: { businessName: 'Acme Gas' } };

beforeEach(() => vi.clearAllMocks());

describe('admin suspend / restore', () => {
  it('requires a reason', async () => {
    expect((await post('/v1/branches/b1/suspend', {})).status).toBe(400);
    expect((await post('/v1/branches/b1/suspend', { reason: 'x' })).status).toBe(400);
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the vendor in the URL', async () => {
    db.branch.findFirst.mockResolvedValue(null);
    expect((await post('/v1/branches/b1/suspend', { reason: 'licence expired' })).status).toBe(404);
    expect(db.branch.findFirst.mock.calls[0][0].where).toEqual({ id: 'b1', vendorId: 'v1' });
  });

  it('suspends, records the open-order count and writes an audit entry', async () => {
    db.branch.findFirst.mockResolvedValue(branch);
    db.order.count.mockResolvedValue(3);
    db.branch.update.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));

    const res = await post('/v1/branches/b1/suspend', { reason: 'licence expired' });
    expect(res.status).toBe(200);
    expect((await res.json()).openOrders).toBe(3);
    const data = db.branch.update.mock.calls[0][0].data;
    expect(data.suspendedReason).toBe('licence expired');
    expect(data.suspendedAt).toBeInstanceOf(Date);
    expect(audit.mock.calls[0][1]).toMatchObject({
      action: 'BRANCH_SUSPENDED',
      resource: 'branch',
      resourceId: 'b1',
      metadata: { openOrders: 3, reason: 'licence expired' }
    });
  });

  it('does not suspend twice', async () => {
    db.branch.findFirst.mockResolvedValue({ ...branch, suspendedAt: new Date() });
    expect((await post('/v1/branches/b1/suspend', { reason: 'again please' })).status).toBe(409);
    expect(db.branch.update).not.toHaveBeenCalled();
  });

  it('restores a suspended branch and audits it', async () => {
    db.branch.findFirst.mockResolvedValue({ ...branch, suspendedAt: new Date(), suspendedReason: 'licence expired' });
    db.branch.update.mockResolvedValue({ id: 'b1' });
    expect((await post('/v1/branches/b1/restore')).status).toBe(200);
    expect(db.branch.update.mock.calls[0][0].data).toEqual({ suspendedAt: null, suspendedReason: null });
    expect(audit.mock.calls[0][1]).toMatchObject({ action: 'BRANCH_RESTORED' });
  });

  it('refuses to restore a branch that is not suspended', async () => {
    db.branch.findFirst.mockResolvedValue(branch);
    expect((await post('/v1/branches/b1/restore')).status).toBe(409);
  });
});
