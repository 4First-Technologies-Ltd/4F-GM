import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

process.env.ADMIN_JWT_SECRET = 'test-secret';
process.env.WEB_APP_URL = 'https://web.test';

const db = vi.hoisted(() => ({
  newsletterSubscriber: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  campaign: { findMany: vi.fn(), findFirst: vi.fn() }
}));
const mail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/email', () => ({
  EMAIL_FROM: 'test <test@example.com>',
  getClient: () => ({ emails: { send: mail.send } })
}));
vi.mock('../src/lib/security', async (orig) => ({ ...(await orig<any>()), newsletterLimiter: (_q: any, _s: any, next: any) => next() }));

import {
  confirmToken,
  newsletterUnsubscribeToken,
  verifyConfirmToken,
  verifyNewsletterUnsubscribeToken
} from '../src/lib/newsletter';
import { unsubscribeToken, verifyUnsubscribeToken } from '../src/lib/marketing';

let server: Server;
let base: string;

beforeAll(async () => {
  const { default: routes } = await import('../src/routes/newsletter');
  const app = express();
  app.use(express.json());
  app.use('/n', routes);
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: String(err?.message ?? err) }));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/n`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  mail.send.mockResolvedValue({ error: null });
  db.newsletterSubscriber.findUnique.mockResolvedValue(null);
});

const post = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('tokens', () => {
  it('confirm tokens round-trip, lowercase the address, and expire after 7 days', () => {
    const t = confirmToken('Ada@Example.com', 1_000);
    expect(verifyConfirmToken(t, 1_000 + 6 * 86_400_000)).toBe('ada@example.com');
    expect(verifyConfirmToken(t, 1_000 + 8 * 86_400_000)).toBeNull();
  });

  it('a tampered token is rejected', () => {
    const t = confirmToken('ada@example.com');
    const [e, s, sig] = t.split('.');
    const forged = `${Buffer.from('eve@example.com').toString('base64url')}.${s}.${sig}`;
    expect(verifyConfirmToken(forged)).toBeNull();
    expect(verifyConfirmToken(`${e}.${s}.x`)).toBeNull();
    expect(verifyConfirmToken('garbage')).toBeNull();
  });

  it('a token minted for one purpose is useless for the others', () => {
    const confirm = confirmToken('ada@example.com');
    const unsub = newsletterUnsubscribeToken('ada@example.com');
    expect(verifyNewsletterUnsubscribeToken(confirm)).toBeNull();
    expect(verifyConfirmToken(unsub)).toBeNull();
    expect(verifyNewsletterUnsubscribeToken(unsub)).toBe('ada@example.com');
    // and the account-marketing unsubscribe link does not unsubscribe the newsletter
    expect(verifyNewsletterUnsubscribeToken(unsubscribeToken('ada@example.com'))).toBeNull();
    expect(verifyUnsubscribeToken(unsub)).toBeNull();
  });
});

describe('POST /subscribe', () => {
  it('emails a confirmation link and stores the address as PENDING', async () => {
    const res = await post('/subscribe', { email: ' Ada@Example.com ', name: 'Ada' });
    expect(res.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('ada@example.com');
    expect(sent.from).toContain('newsletters@notifications.4fgmonitor.com');
    expect(sent.html).toContain('https://web.test/newsletter/confirm?t=');
    expect(db.newsletterSubscriber.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ada@example.com' }, update: expect.objectContaining({ status: 'PENDING' }) })
    );
  });

  it('rejects an invalid address without sending anything', async () => {
    const res = await post('/subscribe', { email: 'nope' });
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('does nothing for the honeypot, but looks successful', async () => {
    const res = await post('/subscribe', { email: 'bot@example.com', website: 'http://spam' });
    expect(res.status).toBe(200);
    expect(mail.send).not.toHaveBeenCalled();
    expect(db.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });

  it('sends nothing to an already-active subscriber, and answers the same', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ status: 'ACTIVE', lastEmailedAt: null });
    const res = await post('/subscribe', { email: 'ada@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('throttles repeat requests for the same pending address', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ status: 'PENDING', lastEmailedAt: new Date() });
    await post('/subscribe', { email: 'ada@example.com' });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('lets someone who unsubscribed sign up again (back to PENDING until they confirm)', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ status: 'UNSUBSCRIBED', lastEmailedAt: null });
    await post('/subscribe', { email: 'ada@example.com' });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(db.newsletterSubscriber.upsert.mock.calls[0][0].update.status).toBe('PENDING');
  });

  it('does not record a subscriber when the confirmation email fails to send', async () => {
    mail.send.mockResolvedValue({ error: { message: 'boom' } });
    const res = await post('/subscribe', { email: 'ada@example.com' });
    expect(res.status).toBe(503);
    expect(db.newsletterSubscriber.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /confirm', () => {
  it('activates a pending subscriber', async () => {
    db.newsletterSubscriber.findUnique.mockResolvedValue({ email: 'ada@example.com', status: 'PENDING' });
    const res = await post('/confirm', { token: confirmToken('ada@example.com') });
    expect(res.status).toBe(200);
    expect(db.newsletterSubscriber.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ada@example.com' }, data: expect.objectContaining({ status: 'ACTIVE' }) })
    );
  });

  it('rejects a bad token and an unknown address', async () => {
    expect((await post('/confirm', { token: 'bad' })).status).toBe(400);
    expect((await post('/confirm', { token: confirmToken('ghost@example.com') })).status).toBe(400);
    expect(db.newsletterSubscriber.update).not.toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('GET only shows a confirm page; POST does the unsubscribe', async () => {
    const t = newsletterUnsubscribeToken('ada@example.com');
    const get = await fetch(`${base}/unsubscribe?t=${t}`);
    expect(get.status).toBe(200);
    expect(db.newsletterSubscriber.updateMany).not.toHaveBeenCalled();

    const res = await fetch(`${base}/unsubscribe?t=${t}`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(db.newsletterSubscriber.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ada@example.com', status: { not: 'UNSUBSCRIBED' } } })
    );
  });

  it('rejects an invalid link', async () => {
    expect((await fetch(`${base}/unsubscribe?t=nope`, { method: 'POST' })).status).toBe(400);
  });
});

describe('archive', () => {
  it('lists only sent newsletter issues, with the name placeholder neutralised in the excerpt', async () => {
    db.campaign.findMany.mockResolvedValue([{ id: 'c1', subject: 'Hello', body: 'Hi {{name}},\n\nSecond paragraph', sentAt: new Date() }]);
    const body = await (await fetch(`${base}/issues`)).json();
    expect(db.campaign.findMany.mock.calls[0][0].where).toEqual({ newsletter: true, status: 'SENT' });
    expect(body.issues[0].excerpt).toBe('Hi there,');
  });

  it('404s an issue that is not a sent newsletter', async () => {
    db.campaign.findFirst.mockResolvedValue(null);
    expect((await fetch(`${base}/issues/c2`)).status).toBe(404);
    expect(db.campaign.findFirst.mock.calls[0][0].where).toEqual({ id: 'c2', newsletter: true, status: 'SENT' });
  });
});
