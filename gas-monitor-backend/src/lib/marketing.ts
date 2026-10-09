import { createHmac, timingSafeEqual } from 'crypto';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { EMAIL_FROM, getClient } from './email';

/* ───────────────────────────── audience ───────────────────────────── */

export const segmentFilterSchema = z.object({
  /** Which kinds of account. Empty/omitted = everyone. */
  roles: z.array(z.nativeEnum(Role)).max(3).default([]),
  /** Applies to vendors only: narrows VENDOR accounts to this approval state. */
  vendorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  /** Vendor state (e.g. Lagos). Matching accounts must be vendors in it. */
  state: z.string().trim().min(1).max(60).optional(),
  /** Whether the account has ever placed an order. */
  hasOrdered: z.boolean().optional(),
  /** Created within the last N days. */
  joinedWithinDays: z.number().int().min(1).max(3650).optional(),
  /** Carries this CRM tag. */
  tag: z.string().trim().toLowerCase().min(1).max(30).optional()
});
export type SegmentFilter = z.infer<typeof segmentFilterSchema>;

/**
 * Who a filter matches. Always restricted to verified, non-suspended accounts:
 * an unverified address is unproven, and a suspended account should not be
 * marketed to. Suppressed addresses are removed separately (see `resolveAudience`).
 */
export function audienceWhere(filter: SegmentFilter): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [{ emailVerified: true }, { isSuspended: false }];

  if (filter.roles.length) and.push({ role: { in: filter.roles } });
  if (filter.vendorStatus) {
    // Only constrains vendors; other roles in the same segment are unaffected.
    and.push({ OR: [{ role: { not: 'VENDOR' } }, { vendorProfile: { status: filter.vendorStatus } }] });
  }
  if (filter.state) {
    and.push({ vendorProfile: { state: { equals: filter.state, mode: 'insensitive' } } });
  }
  if (filter.hasOrdered === true) and.push({ orders: { some: {} } });
  if (filter.hasOrdered === false) and.push({ orders: { none: {} } });
  if (filter.joinedWithinDays) {
    and.push({ createdAt: { gte: new Date(Date.now() - filter.joinedWithinDays * 86_400_000) } });
  }
  if (filter.tag) and.push({ crmTags: { some: { tag: { name: filter.tag } } } });

  return { AND: and };
}

export interface AudienceMember {
  id: string;
  email: string;
  name: string;
}

export async function resolveAudience(filter: SegmentFilter, limit?: number): Promise<AudienceMember[]> {
  const suppressed = new Set((await prisma.marketingSuppression.findMany({ select: { email: true } })).map((s) => s.email));
  const users = await prisma.user.findMany({
    where: audienceWhere(filter),
    select: { id: true, email: true, name: true },
    orderBy: { createdAt: 'asc' }
  });

  const seen = new Set<string>();
  const out: AudienceMember[] = [];
  for (const u of users) {
    const email = u.email.trim().toLowerCase();
    if (suppressed.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ id: u.id, email, name: u.name });
    if (limit && out.length >= limit) break;
  }
  return out;
}

/* ─────────────────────────── unsubscribe ──────────────────────────── */

const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.ADMIN_JWT_SECRET ?? '';

const sign = (email: string) => createHmac('sha256', secret()).update(email).digest('base64url');

/** Stateless: the link proves the address without storing a token per recipient. */
export function unsubscribeToken(email: string): string {
  const e = email.trim().toLowerCase();
  return `${Buffer.from(e).toString('base64url')}.${sign(e)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = Buffer.from(sign(email));
  const given = Buffer.from(sig);
  if (!secret() || expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return email;
}

export const apiPublicUrl = () => (process.env.API_PUBLIC_URL ?? 'https://ugo.4fgmonitor.com').replace(/\/$/, '');
export const unsubscribeUrl = (email: string) => `${apiPublicUrl()}/api/marketing/unsubscribe?t=${unsubscribeToken(email)}`;

/* ──────────────────────────── rendering ───────────────────────────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderCampaignHtml(body: string, recipientName: string, unsubUrl: string): string {
  const first = esc(recipientName.trim().split(/\s+/)[0] || 'there');
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => esc(p.trim()).replace(/\{\{\s*name\s*\}\}/gi, first).replace(/\n/g, '<br>'))
    .filter(Boolean)
    .map((p) => `<p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 16px;">${p}</p>`)
    .join('');

  return `
    <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
      <p style="font-size:13px;font-weight:700;letter-spacing:.5px;color:#2d7450;text-transform:uppercase;margin:0 0 24px;">4FG Smart Gas Monitor</p>
      ${paragraphs}
      <hr style="border:none;border-top:1px solid #e3e6dc;margin:32px 0 16px;">
      <p style="font-size:12px;color:#888;line-height:1.5;">You are receiving this because you have an account with 4FG Smart Gas Monitor.
      <a href="${unsubUrl}" style="color:#888;">Unsubscribe</a></p>
    </div>`;
}

/* ───────────────────────────── sending ────────────────────────────── */

const BATCH_SIZE = 50;
const BATCH_GAP_MS = 700; // stays under Resend's 2 requests/second default
const running = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class CampaignError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

/**
 * Freeze the audience and start sending. The DRAFT→SENDING flip is a
 * compare-and-set so a double click can't send the campaign twice.
 */
export async function startCampaign(campaignId: string): Promise<{ audienceSize: number }> {
  if (!getClient()) throw new CampaignError('Email is not configured (RESEND_API_KEY is missing)', 503);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { segment: true } });
  if (!campaign) throw new CampaignError('Campaign not found', 404);
  if (!campaign.segment) throw new CampaignError('Choose an audience before sending');

  const filter = segmentFilterSchema.parse(campaign.segment.filter);
  const audience = await resolveAudience(filter);
  if (audience.length === 0) throw new CampaignError('This audience has no eligible recipients');

  const { count } = await prisma.campaign.updateMany({
    where: { id: campaignId, status: 'DRAFT' },
    data: { status: 'SENDING', startedAt: new Date(), audienceSize: audience.length, sentCount: 0, failedCount: 0 }
  });
  if (count === 0) throw new CampaignError('This campaign has already been sent', 409);

  await prisma.campaignRecipient.createMany({
    data: audience.map((a) => ({ campaignId, userId: a.id, email: a.email, name: a.name })),
    skipDuplicates: true
  });

  void runCampaign(campaignId);
  return { audienceSize: audience.length };
}

/** Send remaining PENDING recipients in batches. Safe to re-enter after a restart. */
export async function runCampaign(campaignId: string): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);

  try {
    const resend = getClient();
    if (!resend) return;

    for (;;) {
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign || campaign.status !== 'SENDING') return; // cancelled or finished

      const batch = await prisma.campaignRecipient.findMany({
        where: { campaignId, status: 'PENDING' },
        take: BATCH_SIZE,
        orderBy: { email: 'asc' }
      });
      if (batch.length === 0) break;

      // Someone may have unsubscribed since the audience was frozen.
      const suppressed = new Set(
        (await prisma.marketingSuppression.findMany({ where: { email: { in: batch.map((b) => b.email) } } })).map((s) => s.email)
      );
      const skip = batch.filter((b) => suppressed.has(b.email));
      const send = batch.filter((b) => !suppressed.has(b.email));
      if (skip.length) {
        await prisma.campaignRecipient.updateMany({
          where: { id: { in: skip.map((s) => s.id) } },
          data: { status: 'FAILED', error: 'Unsubscribed before send' }
        });
      }

      let sentIds: string[] = [];
      let error: string | null = null;
      if (send.length) {
        const { error: sendError } = await resend.batch.send(
          send.map((r) => {
            const url = unsubscribeUrl(r.email);
            return {
              from: EMAIL_FROM,
              to: r.email,
              subject: campaign.subject,
              html: renderCampaignHtml(campaign.body, r.name, url),
              headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
            };
          })
        );
        if (sendError) error = sendError.message;
        else sentIds = send.map((s) => s.id);
      }

      if (sentIds.length) {
        await prisma.campaignRecipient.updateMany({
          where: { id: { in: sentIds } },
          data: { status: 'SENT', sentAt: new Date() }
        });
      }
      if (error) {
        await prisma.campaignRecipient.updateMany({
          where: { id: { in: send.map((s) => s.id) } },
          data: { status: 'FAILED', error: error.slice(0, 300) }
        });
      }
      await refreshCounts(campaignId);
      await sleep(BATCH_GAP_MS);
    }

    await refreshCounts(campaignId);
    await prisma.campaign.updateMany({
      where: { id: campaignId, status: 'SENDING' },
      data: { status: 'SENT', sentAt: new Date() }
    });
  } catch (err) {
    // Left in SENDING: the next boot resumes from the remaining PENDING rows.
    console.error('[marketing] campaign run failed', { campaignId, err });
  } finally {
    running.delete(campaignId);
  }
}

async function refreshCounts(campaignId: string) {
  const [sentCount, failedCount] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, status: 'SENT' } }),
    prisma.campaignRecipient.count({ where: { campaignId, status: 'FAILED' } })
  ]);
  await prisma.campaign.update({ where: { id: campaignId }, data: { sentCount, failedCount } });
}

/** Called on boot so a deploy or crash mid-send doesn't strand a campaign. */
export async function resumeCampaigns(): Promise<void> {
  const stuck = await prisma.campaign.findMany({ where: { status: 'SENDING' }, select: { id: true } });
  for (const c of stuck) void runCampaign(c.id);
}

export async function sendTestEmail(campaignId: string, to: string): Promise<void> {
  const resend = getClient();
  if (!resend) throw new CampaignError('Email is not configured (RESEND_API_KEY is missing)', 503);
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new CampaignError('Campaign not found', 404);

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: `[Test] ${campaign.subject}`,
    html: renderCampaignHtml(campaign.body, 'Test Recipient', unsubscribeUrl(to))
  });
  if (error) throw new CampaignError(`Resend: ${error.message}`, 502);
}
