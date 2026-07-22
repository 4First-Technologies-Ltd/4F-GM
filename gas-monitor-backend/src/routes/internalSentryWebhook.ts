import { Request, Response } from 'express';
import crypto from 'crypto';

const TELEGRAM_API = 'https://api.telegram.org';

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

async function sendTelegramMessage(text: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return;

  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

function formatIssueMessage(action: string, payload: any) {
  const issue = payload?.data?.issue ?? payload?.data?.event?.issue;
  const project = payload?.data?.issue?.project?.name ?? issue?.project?.slug ?? 'unknown project';
  const title = issue?.title ?? payload?.data?.event?.title ?? 'New error';
  const culprit = issue?.culprit ?? '';
  const level = issue?.level ?? payload?.data?.event?.level ?? 'error';
  const url = issue?.permalink ?? issue?.web_url ?? '';

  return (
    `🚨 <b>${action.toUpperCase()}</b> — ${project}\n` +
    `<b>${title}</b>\n` +
    (culprit ? `${culprit}\n` : '') +
    `Level: ${level}\n` +
    (url ? `${url}` : '')
  );
}

export async function sentryWebhookHandler(req: Request, res: Response) {
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  const signature = req.header('sentry-hook-signature');
  const rawBody = req.body as Buffer;

  if (!secret || !verifySignature(rawBody, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Always ack quickly; Sentry doesn't need us to block on the Telegram call.
  res.status(200).json({ ok: true });

  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const action = payload?.action ?? 'triggered';
    // Only alert on the events that matter — skip "resolved"/"ignored" noise.
    if (!['created', 'unresolved'].includes(action)) return;

    const message = formatIssueMessage(action, payload);
    await sendTelegramMessage(message);
  } catch (err) {
    console.error('sentry webhook handling failed', err);
  }
}
