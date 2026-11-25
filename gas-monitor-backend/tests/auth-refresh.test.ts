import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

process.env.JWT_ACCESS_SECRET = 'access-secret-for-tests';
process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-tests';
delete process.env.JWT_REFRESH_EXPIRES_IN;

const db = vi.hoisted(() => ({
  refreshToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn() }
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));

let server: Server;
let base: string;
let jwtLib: typeof import('../src/lib/jwt');

beforeAll(async () => {
  jwtLib = await import('../src/lib/jwt');
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

const refresh = (refreshToken: string) =>
  fetch(`${base}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }) });

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.co', isSuspended: false });
  db.refreshToken.create.mockResolvedValue({});
  db.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  db.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
});

describe('refresh tokens', () => {
  it('are unique even when issued in the same second, and last 90 days', () => {
    const a = jwtLib.signRefreshToken({ sub: 'u1' });
    const b = jwtLib.signRefreshToken({ sub: 'u1' });
    expect(a).not.toBe(b);
    const days = (jwtLib.refreshTokenExpiresAt().getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(90);
  });

  it('rotation retires the old token after a grace period instead of deleting it', async () => {
    const token = jwtLib.signRefreshToken({ sub: 'u1' });
    db.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const res = await refresh(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).not.toBe(token);

    const retire = db.refreshToken.updateMany.mock.calls[0][0];
    expect(retire.where.id).toBe('rt1');
    const graceLeft = retire.data.expiresAt.getTime() - Date.now();
    expect(graceLeft).toBeGreaterThan(50_000);
    expect(graceLeft).toBeLessThanOrEqual(60_000);
    expect(db.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('a second refresh with the same token inside the grace period still works', async () => {
    const token = jwtLib.signRefreshToken({ sub: 'u1' });
    db.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: new Date(Date.now() + 40_000) });
    expect((await refresh(token)).status).toBe(200);
    // Already inside the grace period: its expiry is not pushed out again.
    expect(db.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('a retired token past its grace period is refused', async () => {
    const token = jwtLib.signRefreshToken({ sub: 'u1' });
    db.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: new Date(Date.now() - 1000) });
    expect((await refresh(token)).status).toBe(401);
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it('a suspended account cannot refresh', async () => {
    const token = jwtLib.signRefreshToken({ sub: 'u1' });
    db.refreshToken.findUnique.mockResolvedValue({ id: 'rt1', expiresAt: new Date(Date.now() + 86_400_000) });
    db.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.co', isSuspended: true });
    expect((await refresh(token)).status).toBe(401);
  });
});
