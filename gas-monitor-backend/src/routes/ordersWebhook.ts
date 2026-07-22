import { Request, Response } from 'express';
import { createHmac } from 'crypto';
import { prisma } from '../lib/prisma';
import { PAYSTACK_SECRET } from '../lib/paystack';

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

  const event = JSON.parse(rawBody) as { event: string; data: { reference: string; status: string } };

  if (event.event === 'charge.success') {
    await prisma.order.updateMany({
      where: { paystackRef: event.data.reference, status: 'PENDING' },
      data: { status: 'CONFIRMED', paystackStatus: event.data.status }
    });
  }

  return res.status(200).send('OK');
}
