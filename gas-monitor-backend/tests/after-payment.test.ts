import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn(), updateMany: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  branchStaff: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
  pushToken: { findMany: vi.fn() }
}));
const pinEmail = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/email', () => ({ sendDeliveryPinEmail: pinEmail }));

const { confirmOrder } = await import('../src/lib/orderPayment');
const { hidePin } = await import('../src/lib/dispatch');

const paid = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  vendorId: 'v1',
  branchId: 'b1',
  deliveryPin: '4821',
  supplierName: 'Gasco',
  cylinderSize: '12.5kg',
  quantity: 1,
  consumer: { id: 'c1', name: 'Ada', email: 'ada@example.com' },
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  db.pushToken.findMany.mockResolvedValue([]);
  db.vendorProfile.findUnique.mockResolvedValue({ userId: 'vendor-user' });
  db.branchStaff.findMany.mockResolvedValue([{ userId: 'manager-user' }]);
});

describe('after payment', () => {
  it('runs only for the call that actually confirmed the order', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });
    db.order.findUnique.mockResolvedValue({ id: 'o1', status: 'CONFIRMED' });
    await confirmOrder('o1');
    expect(pinEmail).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('emails the PIN and tells the vendor and branch managers to accept', async () => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce(paid()).mockResolvedValue({ id: 'o1', status: 'CONFIRMED' });
    await confirmOrder('o1');
    expect(db.order.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'CONFIRMED' });
    expect(pinEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@example.com', pin: '4821' }));
    const recipients = db.notification.createMany.mock.calls.flatMap((c) => c[0].data.map((n: any) => n.userId));
    expect(recipients).toEqual(['c1', 'vendor-user', 'manager-user']);
    // A vendor order waits for the vendor: it is not put in the pool.
    expect(db.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('a platform order (no vendor) goes straight into the job pool', async () => {
    db.order.updateMany.mockResolvedValue({ count: 1 });
    db.order.findUnique.mockResolvedValueOnce(paid({ vendorId: null, branchId: null })).mockResolvedValue({ id: 'o1' });
    await confirmOrder('o1');
    const pool = db.order.updateMany.mock.calls[1][0];
    expect(pool.where).toEqual({ id: 'o1', status: 'CONFIRMED' });
    expect(pool.data).toMatchObject({ status: 'ACCEPTED' });
    expect(pool.data.poolEnteredAt).toBeInstanceOf(Date);
  });
});

describe('hidePin', () => {
  it('drops the PIN and its counters, keeps the rest', () => {
    expect(hidePin({ id: 'o1', deliveryPin: '1', pinAttempts: 2, pinLockedUntil: null, status: 'ACCEPTED' })).toEqual({
      id: 'o1',
      status: 'ACCEPTED'
    });
  });
});
