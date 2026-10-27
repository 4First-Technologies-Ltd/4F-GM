import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  user: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  broadcast: { create: vi.fn(), findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  notification: { count: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  refreshToken: { deleteMany: vi.fn() },
  order: { count: vi.fn() },
  $transaction: vi.fn()
}));
const audit = vi.hoisted(() => vi.fn());
const erase = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/audit', () => ({ writeAuditLog: audit }));
vi.mock('../src/lib/broadcast', async (orig) => ({ ...(await orig<typeof import('../src/lib/broadcast')>()), runBroadcast: run }));
vi.mock('../src/lib/accountDeletion', async (orig) => ({
  ...(await orig<typeof import('../src/lib/accountDeletion')>()),
  eraseAccountAsAdmin: erase
}));
vi.mock('../src/middleware/requireAdmin', () => {
  const pass = (req: any, _res: any, next: any) => {
    req.admin = { adminId: 'a1', name: 'Boss', username: 'boss@example.com', role: 'SUPER_ADMIN' };
    next();
  };
  return { requireAdmin: pass, requireOperations: pass, requireSuperAdmin: pass };
});

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: broadcasts } = await import('../src/routes/admin/broadcasts');
  const { default: vendors } = await import('../src/routes/admin/vendors');
  const app = express();
  app.use(express.json());
  app.use('/broadcasts', broadcasts);
  app.use('/vendors', vendors);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const send = (path: string, method: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockResolvedValue([]);
});

const UUID = '11111111-1111-4111-8111-111111111111';

describe('admin broadcasts', () => {
  const ok = { title: 'Maintenance tonight', body: 'We will be offline 1am-2am.', audience: 'ALL' as const };

  it('needs a title, a body and at least one way to deliver it', async () => {
    expect((await send('/broadcasts', 'POST', { ...ok, title: 'x' })).status).toBe(400);
    expect((await send('/broadcasts', 'POST', { ...ok, body: '' })).status).toBe(400);
    const none = await send('/broadcasts', 'POST', { ...ok, sendInApp: false, sendEmail: false, sendPush: false });
    expect(none.status).toBe(400);
    expect(db.broadcast.create).not.toHaveBeenCalled();
  });

  it('needs a person for "one person", and refuses a person for any other audience', async () => {
    expect((await send('/broadcasts', 'POST', { ...ok, audience: 'USER' })).status).toBe(400);
    expect((await send('/broadcasts', 'POST', { ...ok, audience: 'VENDORS', targetUserId: UUID })).status).toBe(400);
  });

  it('sends nothing when no active account matches', async () => {
    db.user.count.mockResolvedValue(0);
    const res = await send('/broadcasts', 'POST', { ...ok, audience: 'RIDERS' });
    expect(res.status).toBe(400);
    expect(db.broadcast.create).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('404s for a specific person who does not exist', async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect((await send('/broadcasts', 'POST', { ...ok, audience: 'USER', targetUserId: UUID })).status).toBe(404);
  });

  it('records who sent it, audits it, and starts delivery', async () => {
    db.user.count.mockResolvedValue(42);
    db.broadcast.create.mockResolvedValue({ id: 'b1', title: ok.title });
    const res = await send('/broadcasts', 'POST', { ...ok, audience: 'VENDORS', sendEmail: true, sendPush: true });
    expect(res.status).toBe(201);
    expect(db.broadcast.create.mock.calls[0][0].data).toMatchObject({
      audience: 'VENDORS',
      sendInApp: true,
      sendEmail: true,
      sendPush: true,
      createdByName: 'Boss',
      createdByEmail: 'boss@example.com'
    });
    expect(audit.mock.calls[0][1]).toMatchObject({
      action: 'BROADCAST_SENT',
      metadata: { audience: 'VENDORS', recipients: 42, channels: ['in-app', 'email', 'push'] }
    });
    expect(run).toHaveBeenCalledWith('b1');
  });

  it('previews how many people an audience reaches, and rejects an unknown audience', async () => {
    db.user.count.mockResolvedValue(7);
    const res = await send('/broadcasts/preview?audience=CONSUMERS', 'GET');
    expect(await res.json()).toEqual({ count: 7 });
    expect((await send('/broadcasts/preview?audience=EVERYONE', 'GET')).status).toBe(400);
  });
});

describe('vendor suspend, restore and delete', () => {
  const vendor = (over: Record<string, unknown> = {}) => ({
    id: 'v1',
    userId: 'u1',
    businessName: 'Acme Gas',
    user: { id: 'u1', email: 'acme@example.com', isSuspended: false },
    ...over
  });

  it('suspends with a reason, ends their sessions, and leaves open orders alone', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor());
    db.order.count.mockResolvedValue(3);
    expect((await send('/vendors/v1/suspend', 'POST', { reason: 'x' })).status).toBe(400);
    const res = await send('/vendors/v1/suspend', 'POST', { reason: 'Selling short-weight cylinders' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, openOrders: 3 });
    expect(db.$transaction).toHaveBeenCalled();
    expect(audit.mock.calls[0][1]).toMatchObject({
      action: 'VENDOR_SUSPENDED',
      metadata: { reason: 'Selling short-weight cylinders', openOrdersLeftAlone: 3 }
    });
  });

  it('will not suspend twice, or restore a vendor that is not suspended', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor({ user: { isSuspended: true, email: 'a@b.co' } }));
    expect((await send('/vendors/v1/suspend', 'POST', { reason: 'repeat offence' })).status).toBe(409);
    db.vendorProfile.findUnique.mockResolvedValue(vendor());
    expect((await send('/vendors/v1/restore', 'POST')).status).toBe(409);
  });

  it('restores a suspended vendor and clears the reason', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor({ user: { isSuspended: true, email: 'a@b.co' } }));
    expect((await send('/vendors/v1/restore', 'POST')).status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ isSuspended: false, suspendedReason: null, suspendedAt: null });
    expect(audit.mock.calls[0][1]).toMatchObject({ action: 'VENDOR_RESTORED' });
  });

  it('will not restore a vendor that was deleted', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor({ user: { isSuspended: true, email: 'deleted-u1@deleted.invalid' } }));
    expect((await send('/vendors/v1/restore', 'POST')).status).toBe(409);
  });

  it('deleting needs a reason and the business name typed back', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor());
    expect((await send('/vendors/v1', 'DELETE', { reason: 'closing down' })).status).toBe(400);
    expect((await send('/vendors/v1', 'DELETE', { reason: 'closing down', confirmName: 'Wrong Name' })).status).toBe(400);
    expect(erase).not.toHaveBeenCalled();
  });

  it('anonymises the account and audits it', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor());
    erase.mockResolvedValue(undefined);
    const res = await send('/vendors/v1', 'DELETE', { reason: 'Fraud confirmed', confirmName: ' acme gas ' });
    expect(res.status).toBe(200);
    expect(erase).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][1]).toMatchObject({ action: 'VENDOR_DELETED', metadata: { reason: 'Fraud confirmed' } });
  });

  it('passes on why a delete is refused (money owed, deliveries pending) and audits nothing', async () => {
    const { DeletionBlocked } = await import('../src/lib/accountDeletion');
    db.vendorProfile.findUnique.mockResolvedValue(vendor());
    erase.mockRejectedValue(new DeletionBlocked('This vendor has earnings that have not been paid out.', 409, 'CONTACT_SUPPORT'));
    const res = await send('/vendors/v1', 'DELETE', { reason: 'Fraud confirmed', confirmName: 'Acme Gas' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONTACT_SUPPORT' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('will not delete a vendor twice', async () => {
    db.vendorProfile.findUnique.mockResolvedValue(vendor({ user: { isSuspended: true, email: 'deleted-u1@deleted.invalid' } }));
    expect((await send('/vendors/v1', 'DELETE', { reason: 'again please', confirmName: 'Acme Gas' })).status).toBe(409);
  });
});
