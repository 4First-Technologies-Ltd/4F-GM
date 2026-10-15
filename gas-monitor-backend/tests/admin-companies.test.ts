import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  logisticsCompany: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn() }
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
  const { default: router } = await import('../src/routes/admin/companies');
  const app = express();
  app.use(express.json());
  app.use('/companies', router);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/companies`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const patch = (id: string, body: unknown) =>
  fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const company = { id: 'co1', companyName: 'Swift', status: 'PENDING', _count: { riders: 4 } };

beforeEach(() => {
  vi.clearAllMocks();
  db.logisticsCompany.findMany.mockResolvedValue([]);
  db.logisticsCompany.count.mockResolvedValue(0);
});

describe('admin companies', () => {
  it('maps each status change to its own audit action, with the fleet size', async () => {
    db.logisticsCompany.findUnique.mockResolvedValue(company);
    db.logisticsCompany.update.mockResolvedValue({ ...company, status: 'APPROVED' });

    for (const [status, action] of [
      ['APPROVED', 'COMPANY_APPROVED'],
      ['REJECTED', 'COMPANY_REJECTED'],
      ['PENDING', 'COMPANY_STATUS_RESET']
    ] as const) {
      audit.mockClear();
      expect((await patch('co1', { status })).status).toBe(200);
      expect(audit.mock.calls[0][1]).toMatchObject({
        action,
        resource: 'company',
        resourceId: 'co1',
        metadata: { from: 'PENDING', to: status, riders: 4 }
      });
    }
  });

  it('rejects an unknown status without touching the row', async () => {
    expect((await patch('co1', { status: 'SUSPENDED' })).status).toBe(400);
    expect(db.logisticsCompany.update).not.toHaveBeenCalled();
  });

  it('404s for an unknown company and writes no audit entry', async () => {
    db.logisticsCompany.findUnique.mockResolvedValue(null);
    expect((await patch('nope', { status: 'APPROVED' })).status).toBe(404);
    expect(audit).not.toHaveBeenCalled();
  });

  it('ignores an unknown status filter and a non-whitelisted sort', async () => {
    await fetch(`${base}?status=DROP&sort=password`);
    const arg = db.logisticsCompany.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });
});
