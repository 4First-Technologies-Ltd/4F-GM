import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { LEGAL_VERSION } from '../src/lib/legal';
import { inviteTokenHash } from '../src/lib/staff';

const db = vi.hoisted(() => {
  const m: any = {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    vendorProfile: { findUnique: vi.fn() },
    branch: { findFirst: vi.fn() },
    branchStaff: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn()
    },
    legalAcceptance: { createMany: vi.fn() }
  };
  m.$transaction = vi.fn(async (fn: any) => fn(m));
  return m;
});
const mail = vi.hoisted(() => ({ sendManagerInviteEmail: vi.fn() }));
const issue = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/email', async (orig) => ({ ...(await orig<any>()), sendManagerInviteEmail: mail.sendManagerInviteEmail }));
// Rate limiting is covered by its own limiter; here it would just 429 the test run.
vi.mock('../src/lib/security', async (orig) => {
  const real = await orig<any>();
  const pass = (_req: any, _res: any, next: any) => next();
  return { ...real, registerLimiter: pass, inviteLimiter: pass, inviteSendLimiter: pass, otpSendLimiter: pass, otpVerifyLimiter: pass, loginLimiter: pass };
});
vi.mock('../src/lib/auth', () => ({ issueTokenPair: issue, issueOtp: vi.fn(), devOtp: () => ({}) }));
vi.mock('../src/middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { sub: 'owner', email: 'owner@example.com' };
    next();
  }
}));

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: invite } = await import('../src/routes/staffInvite');
  const { default: branches } = await import('../src/routes/vendorBranches');
  const { default: auth } = await import('../src/routes/auth');
  const app = express();
  app.use(express.json());
  app.use('/staff/invite', invite);
  app.use('/branches', branches);
  app.use('/auth', auth);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (path: string, method = 'GET', body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const TOKEN = 'A'.repeat(43); // shape of a base64url 32-byte token
const invite = {
  id: 'i1',
  email: 'mgr@example.com',
  branch: { name: 'Lekki', isActive: true, vendor: { businessName: 'Acme Gas' } }
};
const good = { name: 'Mgr One', password: 'gas-monitor-2026', acceptedTerms: true, legalVersion: LEGAL_VERSION };

beforeEach(() => {
  vi.clearAllMocks();
  db.branchStaff.findFirst.mockResolvedValue(invite);
  db.user.findFirst.mockResolvedValue(null);
  db.branchStaff.updateMany.mockResolvedValue({ count: 1 });
  db.branchStaff.update.mockResolvedValue({});
  db.user.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', createdAt: new Date(), ...data }));
  issue.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
});

describe('GET /staff/invite/:token', () => {
  it('404s for a malformed or unknown token without querying with it raw', async () => {
    expect((await call('/staff/invite/short')).status).toBe(404);
    expect(db.branchStaff.findFirst).not.toHaveBeenCalled();

    db.branchStaff.findFirst.mockResolvedValue(null);
    const res = await call(`/staff/invite/${TOKEN}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('INVITE_INVALID');
  });

  it('looks the invite up by hash, only if still INVITED and unexpired', async () => {
    await call(`/staff/invite/${TOKEN}`);
    const where = db.branchStaff.findFirst.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(inviteTokenHash(TOKEN));
    expect(where.tokenHash).not.toBe(TOKEN);
    expect(where.status).toBe('INVITED');
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('describes the invite and whether an account already exists', async () => {
    db.user.findFirst.mockResolvedValue({ role: 'BRANCH_MANAGER' });
    const { invite: i } = await (await call(`/staff/invite/${TOKEN}`)).json();
    expect(i).toEqual({
      email: 'mgr@example.com',
      branchName: 'Lekki',
      businessName: 'Acme Gas',
      accountExists: true,
      canLink: true
    });
  });
});

describe('POST /staff/invite/:token/accept', () => {
  const accept = (body: unknown = good) => call(`/staff/invite/${TOKEN}/accept`, 'POST', body);

  it('creates a verified BRANCH_MANAGER and signs them in', async () => {
    const res = await accept();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'CREATED', accessToken: 'at', refreshToken: 'rt' });
    expect(body.user).toMatchObject({ email: 'mgr@example.com', role: 'BRANCH_MANAGER' });
    expect(body.user.password).toBeUndefined();

    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ role: 'BRANCH_MANAGER', emailVerified: true, email: 'mgr@example.com' });
    expect(data.password).not.toBe(good.password); // hashed
    expect(db.legalAcceptance.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('burns the token as part of the same transaction (compare-and-set)', async () => {
    await accept();
    expect(db.branchStaff.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'INVITED', tokenHash: inviteTokenHash(TOKEN) },
      data: { status: 'ACTIVE', tokenHash: null }
    });
  });

  it('a second use of the same link loses the race and creates nothing', async () => {
    db.branchStaff.updateMany.mockResolvedValue({ count: 0 });
    const res = await accept();
    expect(res.status).toBe(404);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
  });

  it('rejects weak passwords, missing consent and stale terms', async () => {
    expect((await accept({ ...good, password: 'short1' })).status).toBe(400);
    expect((await accept({ ...good, acceptedTerms: false })).status).toBe(400);
    expect((await accept({ ...good, legalVersion: 'old' })).status).toBe(400);
    expect((await accept({ ...good, name: '' })).status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses an email that already belongs to another kind of account', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'x', role: 'CONSUMER' });
    const res = await accept();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('EMAIL_IN_USE');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.branchStaff.updateMany).not.toHaveBeenCalled();
  });

  it('links an existing manager without a new password or session', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'm1', role: 'BRANCH_MANAGER' });
    const res = await accept({}); // no password needed
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'LINKED', branchName: 'Lekki' });
    expect(db.branchStaff.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', status: 'INVITED' },
      data: { status: 'ACTIVE', userId: 'm1', tokenHash: null }
    });
    expect(issue).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('turns a duplicate-email race into a clean 409', async () => {
    db.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    expect((await accept()).status).toBe(409);
  });
});

describe('the owner sends the invite', () => {
  beforeEach(() => {
    db.vendorProfile.findUnique.mockResolvedValue({ id: 'v1', userId: 'owner', businessName: 'Acme Gas', plan: 'GROWTH' });
    db.branch.findFirst.mockResolvedValue({ id: 'b1', vendorId: 'v1', name: 'Lekki' });
    db.branchStaff.findUnique.mockResolvedValue(null);
    db.branchStaff.count.mockResolvedValue(0);
    db.branchStaff.upsert.mockResolvedValue({ id: 's1', email: 'mgr@example.com', status: 'INVITED' });
    mail.sendManagerInviteEmail.mockResolvedValue(true);
  });

  it('stores only the hash and emails a link carrying the raw token', async () => {
    const res = await call('/branches/b1/staff', 'POST', { email: 'Mgr@Example.com' });
    expect(res.status).toBe(201);
    expect((await res.json()).emailSent).toBe(true);

    const stored = db.branchStaff.upsert.mock.calls[0][0].create.tokenHash as string;
    const mailArg = mail.sendManagerInviteEmail.mock.calls[0][0];
    const token = new URL(mailArg.link).searchParams.get('token')!;
    expect(new URL(mailArg.link).pathname).toBe('/accept-invite');
    expect(stored).toBe(inviteTokenHash(token));
    expect(JSON.stringify(db.branchStaff.upsert.mock.calls[0][0])).not.toContain(token);
    expect(mailArg).toMatchObject({ to: 'mgr@example.com', businessName: 'Acme Gas', branchName: 'Lekki' });
  });

  it('re-inviting rotates the token so the old link dies', async () => {
    await call('/branches/b1/staff', 'POST', { email: 'mgr@example.com' });
    await call('/branches/b1/staff', 'POST', { email: 'mgr@example.com' });
    const [a, b] = db.branchStaff.upsert.mock.calls.map((c: any) => c[0].update.tokenHash);
    expect(a).not.toBe(b);
  });

  it('still saves the invite and says so when the email could not be sent', async () => {
    mail.sendManagerInviteEmail.mockResolvedValue(false);
    const res = await call('/branches/b1/staff', 'POST', { email: 'mgr@example.com' });
    expect(res.status).toBe(201);
    expect((await res.json()).emailSent).toBe(false);
  });
});

describe('public registration', () => {
  it('no longer creates branch managers', async () => {
    const res = await call('/auth/register', 'POST', {
      name: 'Sneaky',
      email: 'sneaky@example.com',
      password: 'gas-monitor-2026',
      role: 'BRANCH_MANAGER',
      acceptedTerms: true,
      legalVersion: LEGAL_VERSION
    });
    expect(res.status).toBe(400);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
