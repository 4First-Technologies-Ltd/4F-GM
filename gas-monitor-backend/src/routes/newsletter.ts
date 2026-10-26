import express, { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { newsletterLimiter } from '../lib/security';
import {
  NewsletterUnavailable,
  confirmSubscription,
  requestSubscription,
  unsubscribeNewsletter,
  verifyNewsletterUnsubscribeToken
} from '../lib/newsletter';

/**
 * Public newsletter API: subscribe (double opt-in), confirm, unsubscribe, and the
 * archive of issues already sent. Nothing here reveals whether an address is known.
 */
const router = Router();

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().max(80).optional(),
  /** Honeypot: hidden in the form, so only bots fill it. */
  website: z.string().optional()
});

router.post(
  '/subscribe',
  newsletterLimiter,
  asyncHandler(async (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (parsed.data.website) return res.json({ ok: true }); // bot: look successful, do nothing

    try {
      await requestSubscription(parsed.data.email, parsed.data.name);
    } catch (err) {
      if (err instanceof NewsletterUnavailable) {
        return res.status(503).json({ error: 'We could not send the confirmation email just now. Please try again later.' });
      }
      throw err;
    }
    return res.json({ ok: true });
  })
);

// POST, not GET: the link in the email opens a web page, which calls this. A mail
// scanner that merely fetches the link therefore cannot confirm anyone.
router.post(
  '/confirm',
  newsletterLimiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    const email = await confirmSubscription(token);
    if (!email) return res.status(400).json({ error: 'This confirmation link is not valid or has expired. Subscribe again to get a new one.' });
    return res.json({ ok: true, email });
  })
);

/* ───────────────────────────── archive ───────────────────────────── */

const firstName = /\{\{\s*name\s*\}\}/gi;
const publicBody = (body: string) => body.replace(firstName, 'there');
const excerpt = (body: string) => {
  const first = publicBody(body).split(/\n{2,}/)[0].replace(/\s+/g, ' ').trim();
  return first.length > 200 ? `${first.slice(0, 197)}…` : first;
};

router.get(
  '/issues',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.campaign.findMany({
      where: { newsletter: true, status: 'SENT' },
      select: { id: true, subject: true, body: true, sentAt: true },
      orderBy: { sentAt: 'desc' },
      take: 50
    });
    return res.json({ issues: rows.map((r) => ({ id: r.id, subject: r.subject, excerpt: excerpt(r.body), sentAt: r.sentAt })) });
  })
);

router.get(
  '/issues/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.campaign.findFirst({
      where: { id: req.params.id, newsletter: true, status: 'SENT' },
      select: { id: true, subject: true, body: true, sentAt: true }
    });
    if (!row) return res.status(404).json({ error: 'Issue not found' });
    return res.json({ issue: { id: row.id, subject: row.subject, body: publicBody(row.body), sentAt: row.sentAt } });
  })
);

/* ─────────────────────────── unsubscribe ─────────────────────────── */

// Same shape as /api/marketing/unsubscribe: GET shows a confirm page, POST acts (and
// serves RFC 8058 one-click), so link scanners cannot unsubscribe people.
const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="font-family:-apple-system,Arial,sans-serif;background:#edf7ed;color:#1a2e1a;margin:0;padding:48px 16px;">
<main style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 24px;">
<p style="font-size:13px;font-weight:700;letter-spacing:.5px;color:#2d7450;text-transform:uppercase;margin:0 0 16px;">4FG Smart Gas Monitor</p>
${body}</main></body></html>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const invalid = page('Link not valid', '<h1 style="font-size:20px;">This link is not valid</h1><p>Use the unsubscribe link from the latest newsletter we sent you.</p>');

router.get('/unsubscribe', (req, res) => {
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  const email = verifyNewsletterUnsubscribeToken(token);
  if (!email) return res.status(400).send(invalid);
  return res.send(
    page(
      'Unsubscribe',
      `<h1 style="font-size:20px;margin:0 0 12px;">Unsubscribe from the newsletter?</h1>
<p style="line-height:1.5;">${esc(email)} will stop receiving the 4FG newsletter. You will still get account and order messages.</p>
<form method="post" action="/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}">
<button type="submit" style="background:#2d7450;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer;">Unsubscribe</button>
</form>`
    )
  );
});

router.post(
  '/unsubscribe',
  express.urlencoded({ extended: false }),
  asyncHandler(async (req, res) => {
    const token = typeof req.query.t === 'string' ? req.query.t : '';
    const email = verifyNewsletterUnsubscribeToken(token);
    if (!email) return res.status(400).send(invalid);
    await unsubscribeNewsletter(email);
    return res.send(
      page('Unsubscribed', `<h1 style="font-size:20px;margin:0 0 12px;">You are unsubscribed</h1><p style="line-height:1.5;">${esc(email)} will no longer receive the newsletter.</p>`)
    );
  })
);

export default router;
