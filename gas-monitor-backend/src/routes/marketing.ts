import express, { Router } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyUnsubscribeToken } from '../lib/marketing';

/**
 * Public unsubscribe. GET only shows a confirmation page; the opt-out happens
 * on POST. Mail scanners and link previewers fetch GET links automatically, and
 * must not be able to unsubscribe people. POST also serves RFC 8058 one-click
 * (the List-Unsubscribe-Post header on every campaign email).
 */
const router = Router();

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title></head>
<body style="font-family:-apple-system,Arial,sans-serif;background:#edf7ed;color:#1a2e1a;margin:0;padding:48px 16px;">
<main style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 24px;">
<p style="font-size:13px;font-weight:700;letter-spacing:.5px;color:#2d7450;text-transform:uppercase;margin:0 0 16px;">4FG Smart Gas Monitor</p>
${body}</main></body></html>`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

router.get('/unsubscribe', (req, res) => {
  const token = typeof req.query.t === 'string' ? req.query.t : '';
  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return res.status(400).send(page('Link not valid', '<h1 style="font-size:20px;">This link is not valid</h1><p>It may be incomplete. Use the unsubscribe link from the latest email we sent you.</p>'));
  }
  return res.send(
    page(
      'Unsubscribe',
      `<h1 style="font-size:20px;margin:0 0 12px;">Unsubscribe from marketing emails?</h1>
<p style="line-height:1.5;">${esc(email)} will stop receiving promotional emails from us. You will still get account and order messages.</p>
<form method="post" action="/api/marketing/unsubscribe?t=${encodeURIComponent(token)}">
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
    const email = verifyUnsubscribeToken(token);
    if (!email) {
      return res.status(400).send(page('Link not valid', '<h1 style="font-size:20px;">This link is not valid</h1>'));
    }
    await prisma.marketingSuppression.upsert({
      where: { email },
      create: { email, reason: 'Unsubscribed via email link' },
      update: {}
    });
    return res.send(
      page('Unsubscribed', `<h1 style="font-size:20px;margin:0 0 12px;">You are unsubscribed</h1><p style="line-height:1.5;">${esc(email)} will no longer receive marketing emails from us.</p>`)
    );
  })
);

export default router;
