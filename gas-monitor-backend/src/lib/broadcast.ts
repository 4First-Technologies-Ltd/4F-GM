import axios from 'axios';
import type { BroadcastAudience, Prisma, Role } from '@prisma/client';
import { prisma } from './prisma';
import { EMAIL_FROM, getClient } from './email';

/**
 * Admin broadcasts: one message, delivered in-app (always), and optionally by
 * email and push. The in-app inbox row is the record of truth; email and push
 * are best-effort and counted, so a Resend or Expo outage never loses the message.
 *
 * Runs in-process after the request returns, like marketing campaigns, so it
 * assumes a single backend instance.
 */

const AUDIENCE_ROLES: Record<Exclude<BroadcastAudience, 'USER' | 'ALL'>, Role[]> = {
  CONSUMERS: ['CONSUMER'],
  VENDORS: ['VENDOR'],
  // Logistics companies are the fleet owners of riders, so "riders" reaches them too.
  RIDERS: ['RIDER', 'LOGISTICS_COMPANY']
};
const ALL_ROLES: Role[] = ['CONSUMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY', 'BRANCH_MANAGER'];

const CHUNK = 500;
const EMAIL_BATCH = 50;
const EMAIL_GAP_MS = 700;
const PUSH_BATCH = 100;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Who an audience reaches: live accounts only (not suspended, not erased). */
export function recipientWhere(audience: BroadcastAudience, targetUserId?: string | null): Prisma.UserWhereInput {
  const live: Prisma.UserWhereInput = { isSuspended: false, NOT: { email: { endsWith: '@deleted.invalid' } } };
  if (audience === 'USER') return { ...live, id: targetUserId ?? '__none__' };
  const roles = audience === 'ALL' ? ALL_ROLES : AUDIENCE_ROLES[audience];
  return { ...live, role: { in: roles } };
}

export function countRecipients(audience: BroadcastAudience, targetUserId?: string | null) {
  return prisma.user.count({ where: recipientWhere(audience, targetUserId) });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderBroadcastHtml(title: string, body: string, name: string) {
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
      <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG Smart Gas Monitor</p>
      <h1 style="font-size: 20px; color: #1a2e1a; margin: 0 0 16px;">${escapeHtml(title)}</h1>
      <p style="font-size: 15px; color: #1a2e1a; margin: 0 0 16px;">Hi ${escapeHtml(name)},</p>
      <p style="font-size: 15px; color: #333; line-height: 1.6; white-space: pre-wrap; margin: 0 0 24px;">${escapeHtml(body)}</p>
      <p style="font-size: 12px; color: #888; line-height: 1.5;">This is a message from the 4FG team about your account. You can also read it in the app.</p>
    </div>
  `;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Recipient = { id: string; name: string; email: string; emailVerified: boolean; pushEnabled: boolean; emailNotifEnabled: boolean };

/** Sends one chunk by email. Returns how many were handed to Resend. */
async function emailChunk(title: string, body: string, people: Recipient[]): Promise<number> {
  const resend = getClient();
  if (!resend) {
    console.warn('[broadcast] RESEND_API_KEY not set — broadcast emails not sent');
    return 0;
  }
  // Only verified addresses, and people who switched email alerts off are respected.
  const targets = people.filter((p) => p.emailVerified && p.emailNotifEnabled);
  let sent = 0;
  for (let i = 0; i < targets.length; i += EMAIL_BATCH) {
    const batch = targets.slice(i, i + EMAIL_BATCH);
    const { error } = await resend.batch.send(
      batch.map((p) => ({ from: EMAIL_FROM, to: p.email, subject: title, html: renderBroadcastHtml(title, body, p.name) }))
    );
    if (error) console.error('[broadcast] Resend batch failed:', error.message);
    else sent += batch.length;
    if (i + EMAIL_BATCH < targets.length) await sleep(EMAIL_GAP_MS);
  }
  return sent;
}

type ExpoTicket = { status: 'ok' | 'error'; details?: { error?: string } };

/** Sends one chunk by Expo push. Returns how many devices were accepted. */
async function pushChunk(title: string, body: string, people: Recipient[], broadcastId: string): Promise<number> {
  const wanted = people.filter((p) => p.pushEnabled).map((p) => p.id);
  if (wanted.length === 0) return 0;
  const tokens = await prisma.pushToken.findMany({ where: { userId: { in: wanted } }, select: { token: true } });
  let accepted = 0;
  for (let i = 0; i < tokens.length; i += PUSH_BATCH) {
    const batch = tokens.slice(i, i + PUSH_BATCH);
    try {
      const { data } = await axios.post<{ data: ExpoTicket[] }>(
        EXPO_PUSH_URL,
        batch.map((t) => ({ to: t.token, title, body, sound: 'default', data: { broadcastId } })),
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {})
          },
          timeout: 15_000
        }
      );
      const dead: string[] = [];
      data.data.forEach((ticket, idx) => {
        if (ticket.status === 'ok') accepted += 1;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[idx].token);
      });
      // The app was uninstalled: stop sending to that token.
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    } catch (err) {
      console.error('[broadcast] Expo push failed:', err instanceof Error ? err.message : err);
    }
  }
  return accepted;
}

/** Delivers a SENDING broadcast to its whole audience, then marks it SENT (or FAILED). */
export async function runBroadcast(id: string): Promise<void> {
  const b = await prisma.broadcast.findUnique({ where: { id } });
  if (!b || b.status !== 'SENDING') return;

  try {
    const where = recipientWhere(b.audience, b.targetUserId);
    let recipientCount = 0;
    let emailsSent = 0;
    let pushesSent = 0;
    let cursor: string | undefined;

    for (;;) {
      const people: Recipient[] = await prisma.user.findMany({
        where,
        select: { id: true, name: true, email: true, emailVerified: true, pushEnabled: true, emailNotifEnabled: true },
        orderBy: { id: 'asc' },
        take: CHUNK,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
      });
      if (people.length === 0) break;
      cursor = people[people.length - 1].id;

      if (b.sendInApp) {
        await prisma.notification.createMany({
          data: people.map((p) => ({ userId: p.id, broadcastId: b.id, title: b.title, body: b.body }))
        });
      }
      if (b.sendEmail) emailsSent += await emailChunk(b.title, b.body, people);
      if (b.sendPush) pushesSent += await pushChunk(b.title, b.body, people, b.id);
      recipientCount += people.length;

      await prisma.broadcast.update({ where: { id }, data: { recipientCount, emailsSent, pushesSent } });
      if (people.length < CHUNK) break;
    }

    await prisma.broadcast.update({
      where: { id },
      data: { status: 'SENT', completedAt: new Date(), recipientCount, emailsSent, pushesSent }
    });
  } catch (err) {
    console.error('[broadcast] failed', id, err);
    await prisma.broadcast
      .update({
        where: { id },
        data: { status: 'FAILED', completedAt: new Date(), error: (err instanceof Error ? err.message : String(err)).slice(0, 300) }
      })
      .catch(() => {});
  }
}
