import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

process.env.R2_PUBLIC_URL = 'https://img.example.com';

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  riderProfile: { findUnique: vi.fn() },
  logisticsCompany: { findUnique: vi.fn() },
  branchStaff: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) }
}));
const storage = vi.hoisted(() => ({
  imageExists: vi.fn(),
  deleteImage: vi.fn(),
  presignImageUpload: vi.fn(),
  publicStorageConfigured: vi.fn()
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/roles', async (orig) => ({
  ...(await orig<typeof import('../src/lib/roles')>()),
  roleFields: async (u: { role: string }) => ({ role: u.role, primaryRole: u.role, roles: [] })
}));
vi.mock('../src/lib/storage', async (orig) => ({ ...(await orig<typeof import('../src/lib/storage')>()), ...storage }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'u1', email: 'a@b.co' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: auth } = await import('../src/routes/auth');
  const app = express();
  app.use(express.json());
  app.use('/auth', auth);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (path: string, method: string, body: unknown) =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const userRow = (avatarUrl: string | null) => ({
  id: 'u1', name: 'Ada', email: 'a@b.co', phone: null, avatarUrl, role: 'CONSUMER', lastActiveRole: null,
  vendorProfile: null, riderProfile: null, logisticsCompany: null
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.publicStorageConfigured.mockReturnValue(true);
  storage.presignImageUpload.mockResolvedValue('https://r2.example.com/put');
  storage.imageExists.mockResolvedValue(true);
});

describe('profile picture', () => {
  it('issues an upload under the user’s own prefix', async () => {
    const res = await call('/auth/me/avatar/upload-url', 'POST', { contentType: 'image/png', size: 1000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toMatch(/^avatars\/u1\/[0-9a-f-]+\.png$/);
    expect(body.uploadUrl).toBe('https://r2.example.com/put');
  });

  it('refuses other file types and big files', async () => {
    expect((await call('/auth/me/avatar/upload-url', 'POST', { contentType: 'image/gif', size: 10 })).status).toBe(400);
    expect((await call('/auth/me/avatar/upload-url', 'POST', { contentType: 'image/jpeg', size: 6 * 1024 * 1024 })).status).toBe(400);
  });

  it('saves a key it issued, deletes the old picture and returns a URL', async () => {
    db.user.findUnique.mockResolvedValue({ avatarUrl: 'avatars/u1/old.png' });
    db.user.update.mockResolvedValue(userRow('avatars/u1/new.png'));
    const res = await call('/auth/me', 'PATCH', { avatarKey: 'avatars/u1/new.png' });
    expect(res.status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toEqual({ avatarUrl: 'avatars/u1/new.png' });
    expect(storage.deleteImage).toHaveBeenCalledWith('avatars/u1/old.png');
    expect((await res.json()).user.avatarUrl).toBe('https://img.example.com/avatars/u1/new.png');
  });

  it("refuses someone else's key, a vendor image key, and an upload that never happened", async () => {
    for (const key of ['avatars/u2/x.png', 'vendor-logos/u1/x.png', 'avatars/u1/../u2/x.png']) {
      expect((await call('/auth/me', 'PATCH', { avatarKey: key })).status).toBe(400);
    }
    storage.imageExists.mockResolvedValue(false);
    expect((await call('/auth/me', 'PATCH', { avatarKey: 'avatars/u1/x.png' })).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('no longer accepts an arbitrary picture URL, but removal still works', async () => {
    expect((await call('/auth/me', 'PATCH', { avatarUrl: 'https://evil.example.com/x.png' })).status).toBe(400);
    db.user.findUnique.mockResolvedValue({ avatarUrl: 'avatars/u1/old.png' });
    db.user.update.mockResolvedValue(userRow(null));
    const res = await call('/auth/me', 'PATCH', { avatarKey: null });
    expect(res.status).toBe(200);
    expect(storage.deleteImage).toHaveBeenCalledWith('avatars/u1/old.png');
  });
});
