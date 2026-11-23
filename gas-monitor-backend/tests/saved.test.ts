import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

const db = vi.hoisted(() => ({
  savedListing: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  gasListing: { findFirst: vi.fn() }
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'u1', email: 'ada@example.com' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: saved } = await import('../src/routes/saved');
  const app = express();
  app.use(express.json());
  app.use('/saved', saved);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (path: string, method = 'GET') => fetch(base + path, { method });

const listingRow = {
  id: 'l1',
  gasType: 'COOKING',
  customName: null,
  pricePerKg: 1240,
  cylinderSizes: ['12.5 kg'],
  otherSizes: null,
  sellsLoose: false,
  inStock: true,
  imageKey: null,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  branch: null,
  vendor: { id: 'v1', businessName: 'Acme Gas', logoUrl: null }
};

beforeEach(() => {
  vi.clearAllMocks();
  db.gasListing.findFirst.mockResolvedValue({ id: 'l1' });
  db.savedListing.findUnique.mockResolvedValue(null);
  db.savedListing.count.mockResolvedValue(0);
  db.savedListing.upsert.mockResolvedValue({});
  db.savedListing.deleteMany.mockResolvedValue({ count: 1 });
  db.savedListing.findMany.mockResolvedValue([]);
});

describe('saving', () => {
  it('saves a public listing for the caller', async () => {
    const res = await call('/saved/l1', 'PUT');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: true });
    expect(db.savedListing.upsert.mock.calls[0][0].create).toEqual({ userId: 'u1', listingId: 'l1' });
  });

  it('only saves listings the marketplace shows (vendor approved, not suspended, branch open)', async () => {
    await call('/saved/l1', 'PUT');
    const where = db.gasListing.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('l1');
    expect(where.vendor).toEqual({ status: 'APPROVED', user: { isSuspended: false } });
    expect(where.OR).toBeDefined();
  });

  it('404s a listing that is not public, and saves nothing', async () => {
    db.gasListing.findFirst.mockResolvedValue(null);
    expect((await call('/saved/nope', 'PUT')).status).toBe(404);
    expect(db.savedListing.upsert).not.toHaveBeenCalled();
  });

  it('is idempotent: saving twice writes once', async () => {
    db.savedListing.findUnique.mockResolvedValue({ listingId: 'l1' });
    const res = await call('/saved/l1', 'PUT');
    expect(res.status).toBe(200);
    expect(db.savedListing.upsert).not.toHaveBeenCalled();
    expect(db.savedListing.count).not.toHaveBeenCalled();
  });

  it('stops at the per-user cap with a clear error', async () => {
    db.savedListing.count.mockResolvedValue(200);
    const res = await call('/saved/l1', 'PUT');
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SAVED_LIMIT');
    expect(db.savedListing.upsert).not.toHaveBeenCalled();
  });

  it('still lets someone at the cap re-save an item they already have', async () => {
    db.savedListing.findUnique.mockResolvedValue({ listingId: 'l1' });
    db.savedListing.count.mockResolvedValue(200);
    expect((await call('/saved/l1', 'PUT')).status).toBe(200);
  });
});

describe('removing', () => {
  it('removes only the caller\'s row', async () => {
    const res = await call('/saved/l1', 'DELETE');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ saved: false });
    expect(db.savedListing.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', listingId: 'l1' } });
  });

  it('succeeds when it was not saved', async () => {
    db.savedListing.deleteMany.mockResolvedValue({ count: 0 });
    expect((await call('/saved/l1', 'DELETE')).status).toBe(200);
  });
});

describe('reading', () => {
  it('lists only the caller\'s saved listings that are still public, newest first, in the public shape', async () => {
    const savedAt = new Date('2026-11-20');
    db.savedListing.findMany.mockResolvedValue([{ createdAt: savedAt, listing: listingRow }]);
    const res = await call('/saved');
    expect(res.status).toBe(200);
    const { listings } = await res.json();
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ id: 'l1', pricePerKg: 1240, savedAt: savedAt.toISOString() });
    expect(listings[0].imageUrl).toBeNull(); // key becomes a url, the raw key is not exposed
    expect('imageKey' in listings[0]).toBe(false);

    const args = db.savedListing.findMany.mock.calls[0][0];
    expect(args.where.userId).toBe('u1');
    expect(args.where.listing.vendor).toEqual({ status: 'APPROVED', user: { isSuspended: false } });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('returns just the ids for marking saved state', async () => {
    db.savedListing.findMany.mockResolvedValue([{ listingId: 'l2' }, { listingId: 'l1' }]);
    const res = await call('/saved/ids');
    expect(await res.json()).toEqual({ ids: ['l2', 'l1'] });
    expect(db.savedListing.findMany.mock.calls[0][0].where.userId).toBe('u1');
  });
});
