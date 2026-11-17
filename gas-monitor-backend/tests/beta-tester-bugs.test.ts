import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

vi.hoisted(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
});

const db = vi.hoisted(() => ({
  tester: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  bugReport: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn()
  },
  bugAttachment: { findMany: vi.fn() },
  bugComment: { findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn()
}));
const mail = vi.hoisted(() => ({
  sendTesterCodeEmail: vi.fn(),
  sendTesterInviteEmail: vi.fn(),
  sendTesterBugUpdateEmail: vi.fn()
}));
const storage = vi.hoisted(() => ({ objectExists: vi.fn(), storageConfigured: vi.fn(), presignUpload: vi.fn(), presignView: vi.fn() }));
const audit = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/audit', () => ({ writeAuditLog: audit }));
vi.mock('../src/lib/email', () => mail);
vi.mock('../src/lib/opsBriefing', () => ({ sendTelegram: vi.fn().mockResolvedValue(null) }));
vi.mock('../src/lib/storage', async (orig) => ({ ...(await orig<typeof import('../src/lib/storage')>()), ...storage }));
vi.mock('../src/lib/security', async (orig) => {
  const real = await orig<typeof import('../src/lib/security')>();
  const pass = (_req: any, _res: any, next: any) => next();
  return { ...real, otpSendLimiter: pass, otpVerifyLimiter: pass, testerUploadLimiter: pass, testerWriteLimiter: pass };
});
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
  const { default: testers } = await import('../src/routes/testers');
  const { default: adminBugs } = await import('../src/routes/admin/bugs');
  const app = express();
  app.use(express.json());
  app.use('/api/testers', testers);
  app.use('/api/admin/bugs', adminBugs);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const json = (method: string, url: string, body?: unknown, token?: string) =>
  fetch(`${base}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const tester = { id: 't1', email: 'ada@example.com', name: 'Ada', isActive: true, tokenVersion: 0 };

/** Sign in through the real endpoints and hand back the session token. */
async function signIn(): Promise<string> {
  let sentCode = '';
  mail.sendTesterCodeEmail.mockImplementationOnce(async (_to: string, code: string) => {
    sentCode = code;
  });
  db.tester.findUnique.mockResolvedValue(tester);
  db.tester.update.mockResolvedValue(tester);
  await json('POST', '/testers/login/request', { email: tester.email });
  const { hashOtp } = await import('../src/lib/otp');
  db.tester.findUnique.mockResolvedValue({ ...tester, otpCodeHash: hashOtp(sentCode), otpExpiresAt: new Date(Date.now() + 60_000), otpAttempts: 0 });
  const res = await json('POST', '/testers/login/verify', { email: tester.email, otp: sentCode });
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  db.tester.findUnique.mockResolvedValue(tester);
  return token;
}

const validReport = {
  title: 'Assign rider sheet is empty',
  area: 'VENDOR',
  steps: '1. Sign in\n2. Open orders\n3. Tap assign',
  expected: 'Riders listed',
  actual: 'Nothing listed',
  severity: 'HIGH',
  frequency: 'ALWAYS'
};

beforeEach(() => {
  vi.resetAllMocks();
  storage.storageConfigured.mockReturnValue(true);
  storage.objectExists.mockResolvedValue(true);
  db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('tester sign-in', () => {
  it('answers the same for an address that is not on the team, and sends nothing', async () => {
    db.tester.findUnique.mockResolvedValue(null);
    const res = await json('POST', '/testers/login/request', { email: 'stranger@example.com' });
    expect(res.status).toBe(200);
    expect(mail.sendTesterCodeEmail).not.toHaveBeenCalled();
    expect(db.tester.update).not.toHaveBeenCalled();
  });

  it('does not send a code to a deactivated tester', async () => {
    db.tester.findUnique.mockResolvedValue({ ...tester, isActive: false });
    await json('POST', '/testers/login/request', { email: tester.email });
    expect(mail.sendTesterCodeEmail).not.toHaveBeenCalled();
  });

  it('counts a wrong code, and rejects it', async () => {
    const { hashOtp } = await import('../src/lib/otp');
    db.tester.findUnique.mockResolvedValue({ ...tester, otpCodeHash: hashOtp('123456'), otpExpiresAt: new Date(Date.now() + 60_000), otpAttempts: 0 });
    const res = await json('POST', '/testers/login/verify', { email: tester.email, otp: '000000' });
    expect(res.status).toBe(400);
    expect(db.tester.update.mock.calls[0][0].data).toEqual({ otpAttempts: { increment: 1 } });
  });

  it('refuses an expired code and one that has used up its attempts', async () => {
    const { hashOtp } = await import('../src/lib/otp');
    const base = { ...tester, otpCodeHash: hashOtp('123456') };
    db.tester.findUnique.mockResolvedValueOnce({ ...base, otpExpiresAt: new Date(Date.now() - 1000), otpAttempts: 0 });
    expect((await json('POST', '/testers/login/verify', { email: tester.email, otp: '123456' })).status).toBe(400);
    db.tester.findUnique.mockResolvedValueOnce({ ...base, otpExpiresAt: new Date(Date.now() + 60_000), otpAttempts: 5 });
    expect((await json('POST', '/testers/login/verify', { email: tester.email, otp: '123456' })).status).toBe(400);
  });

  it('clears the code when it is used, so it works once', async () => {
    await signIn();
    const clear = db.tester.update.mock.calls.find((c) => c[0].data.otpCodeHash === null);
    expect(clear?.[0].data).toMatchObject({ otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0 });
  });
});

describe('tester session', () => {
  it('needs a token', async () => {
    expect((await json('GET', '/testers/bugs')).status).toBe(401);
    expect((await json('GET', '/testers/bugs', undefined, 'garbage')).status).toBe(401);
  });

  it('stops working the moment the tester is deactivated or their sessions are revoked', async () => {
    const token = await signIn();
    expect((await json('GET', '/testers/me', undefined, token)).status).toBe(200);
    db.tester.findUnique.mockResolvedValue({ ...tester, isActive: false });
    expect((await json('GET', '/testers/me', undefined, token)).status).toBe(401);
    db.tester.findUnique.mockResolvedValue({ ...tester, tokenVersion: 1 });
    expect((await json('GET', '/testers/me', undefined, token)).status).toBe(401);
  });

  it('is not accepted as a customer access token, or the other way round', async () => {
    const token = await signIn();
    const jwt = (await import('jsonwebtoken')).default;
    const userToken = jwt.sign({ sub: 't1', email: 'x@y.z' }, 'test-access-secret', { expiresIn: '5m' });
    expect((await json('GET', '/testers/me', undefined, userToken)).status).toBe(401);
    expect(() => jwt.verify(token, 'test-access-secret')).toThrow();
  });
});

describe('filing and reading reports', () => {
  it('files a report for the signed-in tester only', async () => {
    const token = await signIn();
    db.bugReport.create.mockResolvedValue({ id: 'b1', number: 7, ...validReport });
    const res = await json('POST', '/testers/bugs', { ...validReport, testerId: 'someone-else' }, token);
    expect(res.status).toBe(201);
    expect(db.bugReport.create.mock.calls[0][0].data.testerId).toBe('t1');
  });

  it('refuses attachments outside the tester’s own folder, or that never finished uploading', async () => {
    const token = await signIn();
    const file = (key: string) => ({ key, fileName: 'a.png', contentType: 'image/png', size: 100 });

    let res = await json('POST', '/testers/bugs', { ...validReport, attachments: [file('bug-evidence/other/x.png')] }, token);
    expect(res.status).toBe(400);
    res = await json('POST', '/testers/bugs', { ...validReport, attachments: [file('bug-evidence/t1/../other/x.png')] }, token);
    expect(res.status).toBe(400);

    storage.objectExists.mockResolvedValue(false);
    res = await json('POST', '/testers/bugs', { ...validReport, attachments: [file('bug-evidence/t1/abc.png')] }, token);
    expect(res.status).toBe(400);
    expect(db.bugReport.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown area, a too-short title and more than six files', async () => {
    const token = await signIn();
    expect((await json('POST', '/testers/bugs', { ...validReport, area: 'ADMIN' }, token)).status).toBe(400);
    expect((await json('POST', '/testers/bugs', { ...validReport, title: 'x' }, token)).status).toBe(400);
    const many = Array.from({ length: 7 }, (_, i) => ({ key: `bug-evidence/t1/${i}.png`, fileName: 'a.png', contentType: 'image/png', size: 1 }));
    expect((await json('POST', '/testers/bugs', { ...validReport, attachments: many }, token)).status).toBe(400);
  });

  it('only lets a tester read their own report, and never shows internal notes or the assignee', async () => {
    const token = await signIn();
    db.bugReport.findFirst.mockResolvedValue({
      id: 'b1',
      number: 7,
      testerId: 't1',
      assigneeId: 'a1',
      assigneeName: 'Ops',
      title: 'T',
      status: 'NEW'
    });
    db.bugAttachment.findMany.mockResolvedValue([]);
    db.bugComment.findMany.mockResolvedValue([]);
    const res = await json('GET', '/testers/bugs/7', undefined, token);
    expect(res.status).toBe(200);
    expect(db.bugReport.findFirst.mock.calls[0][0].where).toEqual({ number: 7, testerId: 't1' });
    expect(db.bugComment.findMany.mock.calls[0][0].where).toMatchObject({ internal: false });
    const body = (await res.json()) as { bug: Record<string, unknown> };
    expect(body.bug).not.toHaveProperty('assigneeId');
    expect(body.bug).not.toHaveProperty('assigneeName');

    db.bugReport.findFirst.mockResolvedValue(null);
    expect((await json('GET', '/testers/bugs/8', undefined, token)).status).toBe(404);
  });

  it('puts a report back in the queue when the tester answers a question', async () => {
    const token = await signIn();
    db.bugReport.findFirst.mockResolvedValue({ id: 'b1', number: 7, testerId: 't1', status: 'NEEDS_INFO' });
    db.bugComment.create.mockResolvedValue({ id: 'c1', body: 'Android 14', createdAt: new Date() });
    const res = await json('POST', '/testers/bugs/7/comments', { body: 'Android 14' }, token);
    expect(res.status).toBe(201);
    expect(db.bugReport.update.mock.calls[0][0].data).toEqual({ status: 'NEW' });
  });

  it('lets a tester retest only a fixed report, confirming or reopening it', async () => {
    const token = await signIn();
    db.bugReport.findFirst.mockResolvedValue({ id: 'b1', number: 7, testerId: 't1', status: 'NEW' });
    expect((await json('POST', '/testers/bugs/7/retest', { fixed: true }, token)).status).toBe(409);

    db.bugReport.findFirst.mockResolvedValue({ id: 'b1', number: 7, testerId: 't1', status: 'FIXED' });
    db.bugReport.updateMany.mockResolvedValue({ count: 1 });
    db.bugComment.create.mockResolvedValue({});
    let res = await json('POST', '/testers/bugs/7/retest', { fixed: true }, token);
    expect(await res.json()).toEqual({ status: 'VERIFIED' });
    expect(db.bugReport.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'b1', status: 'FIXED' } });

    res = await json('POST', '/testers/bugs/7/retest', { fixed: false, note: 'Still blank' }, token);
    expect(await res.json()).toEqual({ status: 'NEW' });

    // Lost the race: somebody else already moved it.
    db.bugReport.updateMany.mockResolvedValue({ count: 0 });
    expect((await json('POST', '/testers/bugs/7/retest', { fixed: true }, token)).status).toBe(409);
  });

  it('only issues upload links for allowed types and sizes', async () => {
    const token = await signIn();
    storage.presignUpload.mockResolvedValue('https://r2.example/put');
    const ok = await json('POST', '/testers/uploads/url', { contentType: 'video/mp4', size: 1000, fileName: 'a.mp4' }, token);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { key: string }).key).toMatch(/^bug-evidence\/t1\/.+\.mp4$/);
    expect((await json('POST', '/testers/uploads/url', { contentType: 'application/x-msdownload', size: 10, fileName: 'a.exe' }, token)).status).toBe(400);
    expect((await json('POST', '/testers/uploads/url', { contentType: 'video/mp4', size: 60 * 1024 * 1024, fileName: 'a.mp4' }, token)).status).toBe(400);
  });
});

describe('admin triage', () => {
  const bug = { id: 'b1', number: 7, testerId: 't1', title: 'T', status: 'NEW', severity: 'HIGH', fixedInBuild: null, duplicateOfNumber: null, assigneeId: null };

  beforeEach(() => {
    db.bugReport.findUnique.mockResolvedValue(bug);
    db.bugReport.update.mockResolvedValue({});
    db.tester.findUnique.mockResolvedValue({ name: 'Ada', email: 'ada@example.com', isActive: true });
  });

  const patch = (body: unknown) => json('PATCH', '/admin/bugs/7', body);

  it('will not mark a bug fixed without saying which build', async () => {
    expect((await patch({ status: 'FIXED' })).status).toBe(400);
    expect(db.bugReport.update).not.toHaveBeenCalled();
  });

  it('marks it fixed with a build, and emails the tester to retest', async () => {
    expect((await patch({ status: 'FIXED', fixedInBuild: '1.0.4' })).status).toBe(200);
    expect(db.bugReport.update.mock.calls[0][0].data).toMatchObject({ status: 'FIXED', fixedInBuild: '1.0.4' });
    expect(mail.sendTesterBugUpdateEmail).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][1]).toMatchObject({ action: 'BUG_CHANGED', resource: 'bug' });
  });

  it('needs a question for the tester before asking for more information', async () => {
    expect((await patch({ status: 'NEEDS_INFO' })).status).toBe(400);
    expect((await patch({ status: 'NEEDS_INFO', message: 'Which Android version?' })).status).toBe(200);
    const note = db.bugComment.create.mock.calls[0][0].data;
    expect(note).toMatchObject({ author: 'ADMIN', body: 'Which Android version?' });
    expect(note.internal).toBeUndefined(); // visible to the tester
  });

  it('checks the report a duplicate points at', async () => {
    expect((await patch({ status: 'DUPLICATE' })).status).toBe(400);
    expect((await patch({ status: 'DUPLICATE', duplicateOfNumber: 7 })).status).toBe(400);
    db.bugReport.findUnique.mockResolvedValueOnce(bug).mockResolvedValueOnce(null);
    expect((await patch({ status: 'DUPLICATE', duplicateOfNumber: 99 })).status).toBe(400);
  });

  it('does not email the tester for routine changes', async () => {
    await patch({ status: 'CONFIRMED' });
    await patch({ severity: 'LOW' });
    expect(mail.sendTesterBugUpdateEmail).not.toHaveBeenCalled();
  });

  it('only accepts assignment to yourself or nobody', async () => {
    expect((await patch({ assignee: 'someone-else' })).status).toBe(400);
    expect((await patch({ assignee: 'me' })).status).toBe(200);
    expect(db.bugReport.update.mock.calls[0][0].data).toMatchObject({ assigneeId: 'a1', assigneeName: 'Ops' });
  });

  it('ignores a non-whitelisted sort and an unknown status filter in the list', async () => {
    db.bugReport.findMany.mockResolvedValue([]);
    db.bugReport.count.mockResolvedValue(0);
    await json('GET', '/admin/bugs?status=DROP&sort=tester');
    const arg = db.bugReport.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({});
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' });
  });

  it('adds a tester, refusing a duplicate email', async () => {
    db.tester.findUnique.mockResolvedValue({ id: 't9' });
    expect((await json('POST', '/admin/bugs/testers', { name: 'Bola', email: 'bola@example.com' })).status).toBe(409);
    db.tester.findUnique.mockResolvedValue(null);
    db.tester.create.mockResolvedValue({ id: 't9' });
    mail.sendTesterInviteEmail.mockResolvedValue(true);
    const res = await json('POST', '/admin/bugs/testers', { name: 'Bola', email: 'Bola@Example.com' });
    expect(res.status).toBe(201);
    expect(db.tester.create.mock.calls[0][0].data).toMatchObject({ email: 'bola@example.com', invitedByName: 'Ops' });
  });

  it('deactivating a tester ends their sessions and cancels any code in flight', async () => {
    db.tester.findUnique.mockResolvedValue({ id: 't1', name: 'Ada', email: 'ada@example.com', isActive: true });
    db.tester.update.mockResolvedValue({ id: 't1', name: 'Ada', email: 'ada@example.com', isActive: false });
    expect((await json('PATCH', '/admin/bugs/testers/t1', { isActive: false })).status).toBe(200);
    expect(db.tester.update.mock.calls[0][0].data).toMatchObject({
      isActive: false,
      tokenVersion: { increment: 1 },
      otpCodeHash: null,
      otpExpiresAt: null
    });
  });
});
