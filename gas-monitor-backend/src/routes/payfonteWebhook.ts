import { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { safeEqual } from '../lib/security';
import { prisma } from '../lib/prisma';
import { verifyAndConfirm } from '../lib/orderPayment';

/**
 * Payfonte webhook (`payment.completed` and friends). Mounted in app.ts with
 * express.raw() so the exact bytes are available: the signature is
 * HMAC-SHA512(raw body, client-secret) in `x-webhook-signature`.
 *
 * The body is never trusted for money: it only tells us which order to look at.
 * We then ask Payfonte directly (verify endpoint, amount checked) before confirming,
 * so a replayed or forged-but-signed payload cannot confirm an unpaid order.
 * Always 200 once the signature is good, so Payfonte does not retry forever.
 */
export async function payfonteWebhookHandler(req: Request, res: Response) {
  const secret = (process.env.PAYFONTE_CLIENT_SECRET ?? '').trim();
  const signature = req.headers['x-webhook-signature'];
  if (!secret) return res.status(503).send('Not configured');
  if (!signature || typeof signature !== 'string') return res.status(400).send('Missing signature');

  const raw = req.body as Buffer;
  const expected = createHmac('sha512', secret).update(raw).digest('hex');
  if (!safeEqual(expected, signature.trim().toLowerCase())) return res.status(401).send('Bad signature');

  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('Bad body');
  }

  // Payfonte's own reference and ours (externalReference) can both appear; match either.
  const refs = [event?.reference, event?.data?.reference, event?.data?.externalReference, event?.data?.paymentReference]
    .filter((r): r is string => typeof r === 'string' && r.length > 0);
  if (!refs.length) return res.status(200).send('OK');

  try {
    const order = await prisma.order.findFirst({
      where: { paymentProvider: 'PAYFONTE', paystackRef: { in: refs } },
      select: { id: true, paymentProvider: true, paystackRef: true, totalAmount: true }
    });
    if (order) await verifyAndConfirm(order);
  } catch (err) {
    // Gateway hiccup: answer 500 so Payfonte retries; the reconcile job is the backstop.
    console.error('[payfonte] webhook handling failed', err);
    return res.status(500).send('Retry');
  }
  return res.status(200).send('OK');
}
