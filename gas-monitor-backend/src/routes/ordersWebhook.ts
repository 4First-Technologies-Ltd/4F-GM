import { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { prisma } from '../lib/prisma';
import { PAYSTACK_SECRET } from '../lib/paystack';
import { applyTransferStatus } from '../lib/payouts';

// Mounted separately in app.ts with express.raw() so the exact request bytes
// are available for HMAC verification — do not run through express.json().
export async function paystackWebhookHandler(req: Request, res: Response) {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = (req.body as Buffer).toString('utf8');

  if (!signature || typeof signature !== 'string') {
    return res.status(400).send('Missing signature');
  }

  const hash = createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  if (hash !== signature) {
    return res.status(400).send('Bad signature');
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    data: { reference: string; status: string; transfer_code?: string; reason?: string };
  };

  if (event.event === 'charge.success') {
    await prisma.order.updateMany({
      where: { paystackRef: event.data.reference, status: 'PENDING' },
      data: { status: 'CONFIRMED', paystackStatus: event.data.status }
    });
  }

  // Vendor payout outcomes. applyTransferStatus is idempotent, so Paystack's
  // retries of the same event are harmless.
  if (event.event === 'transfer.success' || event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const payout = await prisma.payout.findUnique({ where: { reference: event.data.reference } });
    if (payout) {
      await applyTransferStatus(
        payout.id,
        event.event.replace('transfer.', ''),
        event.data.transfer_code,
        event.data.reason
      );
    }
  }

  return res.status(200).send('OK');
}
