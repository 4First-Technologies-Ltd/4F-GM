import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() }
}));
const gw = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/gateways', async (orig) => ({
  ...(await orig<typeof import('../src/lib/gateways')>()),
  getGateway: () => ({ id: 'PAYFONTE', verify: gw.verify })
}));

import { payfonteWebhookHandler } from '../src/routes/payfonteWebhook';
import { reconcilePendingOrders } from '../src/lib/orderPayment';

const SECRET = 'shh';
const order = { id: 'o1', paymentProvider: 'PAYFONTE', paystackRef: '4FG-o1', totalAmount: 5000 };

function call(body: object, sign = true, signature?: string) {
  const raw = Buffer.from(JSON.stringify(body));
  const req: any = {
    body: raw,
    headers: sign ? { 'x-webhook-signature': signature ?? createHmac('sha512', SECRET).update(raw).digest('hex') } : {}
  };
  const res: any = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, send() { return this; } };
  return payfonteWebhookHandler(req, res).then(() => res.statusCode as number);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYFONTE_CLIENT_SECRET = SECRET;
  db.order.findFirst.mockResolvedValue(order);
});

describe('payfonte webhook', () => {
  it('rejects a missing or wrong signature without touching orders', async () => {
    expect(await call({ reference: '4FG-o1' }, false)).toBe(400);
    expect(await call({ reference: '4FG-o1' }, true, 'deadbeef')).toBe(401);
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('confirms only after Payfonte itself says the order is paid in full', async () => {
    gw.verify.mockResolvedValue({ state: 'paid' });
    expect(await call({ event: 'payment.completed', reference: '4FG-o1' })).toBe(200);
    expect(gw.verify).toHaveBeenCalledWith('4FG-o1', 5000);
    expect(db.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'o1', status: 'PENDING' } }));
  });

  it('does not trust the payload: unpaid per the gateway means no confirmation', async () => {
    gw.verify.mockResolvedValue({ state: 'pending' });
    expect(await call({ data: { status: 'success' }, reference: '4FG-o1' })).toBe(200);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('answers 500 when the gateway is down so Payfonte retries', async () => {
    gw.verify.mockRejectedValue(new Error('down'));
    expect(await call({ reference: '4FG-o1' })).toBe(500);
  });
});

describe('reconcile', () => {
  it('confirms paid stale orders, skips unpaid ones, survives a gateway error', async () => {
    db.order.findMany.mockResolvedValue([
      { ...order, id: 'a' },
      { ...order, id: 'b' },
      { ...order, id: 'c' }
    ]);
    gw.verify
      .mockResolvedValueOnce({ state: 'paid' })
      .mockResolvedValueOnce({ state: 'pending' })
      .mockRejectedValueOnce(new Error('boom'));
    expect(await reconcilePendingOrders()).toBe(1);
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.paymentProvider.in).toEqual(['PAYFONTE', 'MYIMO']);
  });
});
