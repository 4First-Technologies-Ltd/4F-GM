import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from './prisma';
import { getClient } from './email';

/**
 * Newsletter sign-ups. Double opt-in: a sign-up is PENDING until the person opens the
 * link we email them, so nobody can subscribe an address they do not own. Issues
 * themselves are `Campaign` rows with `newsletter = true` (see marketing.ts).
 */

/** Newsletter mail has its own sender; account and order mail keep using EMAIL_FROM. */
export const NEWSLETTER_FROM = process.env.NEWSLETTER_FROM ?? '4FG Smart Gas Monitor <newsletters@notifications.4fgmonitor.com>';

const CONFIRM_TTL_MS = 7 * 86_400_000;
const RESEND_GAP_MS = 2 * 60_000;

const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.ADMIN_JWT_SECRET ?? '';
const webUrl = () => (process.env.WEB_APP_URL ?? 'https://4fgmonitor.com').replace(/\/$/, '');
const apiUrl = () => (process.env.API_PUBLIC_URL ?? 'https://ugo.4fgmonitor.com').replace(/\/$/, '');

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/* ───────────────────────────── tokens ───────────────────────────── */

// The purpose is part of what is signed, so a confirm link can never act as an
// unsubscribe link (or the reverse), and neither is valid for the campaign unsubscribe.
const sign = (purpose: string, email: string, stamp: string) =>
  createHmac('sha256', secret()).update(`${purpose}:${email}:${stamp}`).digest('base64url');

function mint(purpose: string, email: string, stamp: string): string {
  return `${Buffer.from(email).toString('base64url')}.${stamp}.${sign(purpose, email, stamp)}`;
}

function open(purpose: string, token: string): { email: string; stamp: string } | null {
  const [encoded, stamp, sig] = token.split('.');
  if (!encoded || !stamp || !sig || !secret()) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(purpose, email, stamp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { email, stamp };
}

export const confirmToken = (email: string, now = Date.now()) => mint('newsletter-confirm', normaliseEmail(email), String(now));

export function verifyConfirmToken(token: string, now = Date.now()): string | null {
  const opened = open('newsletter-confirm', token);
  if (!opened) return null;
  const issued = Number(opened.stamp);
  if (!Number.isFinite(issued) || now - issued > CONFIRM_TTL_MS) return null;
  return opened.email;
}

export const newsletterUnsubscribeToken = (email: string) => mint('newsletter-unsubscribe', normaliseEmail(email), '0');
export const verifyNewsletterUnsubscribeToken = (token: string) => open('newsletter-unsubscribe', token)?.email ?? null;

export const newsletterUnsubscribeUrl = (email: string) => `${apiUrl()}/api/newsletter/unsubscribe?t=${newsletterUnsubscribeToken(email)}`;
const confirmUrl = (email: string) => `${webUrl()}/newsletter/confirm?t=${confirmToken(email)}`;

/* ─────────────────────────── subscribing ────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class NewsletterUnavailable extends Error {}

async function sendConfirmationEmail(to: string, link: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    if (process.env.NODE_ENV === 'production') throw new NewsletterUnavailable('Email is not configured');
    console.warn(`[newsletter] RESEND_API_KEY not set — confirmation link for ${to}: ${link}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: NEWSLETTER_FROM,
    to,
    subject: 'Confirm your subscription — 4FG Smart Gas Monitor',
    html: `
      <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
        <p style="font-size:13px;font-weight:700;letter-spacing:.5px;color:#2d7450;text-transform:uppercase;margin:0 0 24px;">4FG Smart Gas Monitor</p>
        <h1 style="font-size:20px;margin:0 0 12px;">One click to subscribe</h1>
        <p style="font-size:15px;color:#444;line-height:1.5;margin:0 0 24px;">Confirm that you want to get the 4FG newsletter — product updates, safety tips and vendor news.</p>
        <p style="margin:0 0 24px;"><a href="${esc(link)}" style="display:inline-block;background:#2d7450;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">Confirm subscription</a></p>
        <p style="font-size:13px;color:#888;line-height:1.5;">This link works for 7 days. If you did not ask for this, ignore this email and you will not be subscribed.</p>
      </div>`
  });
  if (error) {
    console.error('[newsletter] Resend failed to send a confirmation', { to, error });
    throw new NewsletterUnavailable(error.message);
  }
}

/**
 * Start (or restart) a subscription. Deliberately says nothing about whether the address
 * was already known: an ACTIVE subscriber gets no email and the caller sees the same result.
 */
export async function requestSubscription(rawEmail: string, name?: string | null): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === 'ACTIVE') return;

  const now = new Date();
  // A double click or a bot hammering one address must not become a mail cannon.
  if (existing?.lastEmailedAt && now.getTime() - existing.lastEmailedAt.getTime() < RESEND_GAP_MS) return;

  await sendConfirmationEmail(email, confirmUrl(email));
  await prisma.newsletterSubscriber.upsert({
    where: { email },
    create: { email, name: name?.trim() || null, lastEmailedAt: now },
    update: { status: 'PENDING', unsubscribedAt: null, lastEmailedAt: now, ...(name?.trim() ? { name: name.trim() } : {}) }
  });
}

/** Opening the emailed link. Returns the address, or null for a bad/expired/unknown link. */
export async function confirmSubscription(token: string): Promise<string | null> {
  const email = verifyConfirmToken(token);
  if (!email) return null;
  const row = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (!row) return null;
  if (row.status !== 'ACTIVE') {
    await prisma.newsletterSubscriber.update({
      where: { email },
      data: { status: 'ACTIVE', confirmedAt: new Date(), unsubscribedAt: null }
    });
  }
  return email;
}

export async function unsubscribeNewsletter(email: string): Promise<void> {
  await prisma.newsletterSubscriber.updateMany({
    where: { email, status: { not: 'UNSUBSCRIBED' } },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date() }
  });
}

/** Everyone who confirmed and has not left. */
export async function resolveNewsletterAudience() {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' }
  });
  return rows.map((r) => ({ id: r.id, email: r.email, name: r.name ?? '' }));
}
