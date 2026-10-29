import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  earning: { create: vi.fn() },
  vendorProfile: { findUnique: vi.fn() },
  vendorBankAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
  riderEarning: { create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  riderBankAccount: { update: vi.fn() },
  platformSettings: { upsert: vi.fn() }
}));
const ps = vi.hoisted(() => ({
  verifyTransfer: vi.fn(),
  createTransferRecipient: vi.fn(),
  initiateTransfer: vi.fn()
}));

vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/lib/paystack', async (orig) => ({ ...(await orig<typeof import('../src/lib/paystack')>()), ...ps }));
vi.mock('axios', async (orig) => {
  const real = await orig<typeof import('axios')>();
  return {
    ...real,
    default: { ...real.default, request: vi.fn(), post: vi.fn(), isAxiosError: real.default.isAxiosError }
  };
});

import { recordEarning } from '../src/lib/earnings';
import { planVendorSplit, vendorShare } from '../src/lib/settlement';
import { paystackGateway } from '../src/lib/gateways/paystackGateway';
import { myimoGateway } from '../src/lib/gateways/myimoGateway';
import { PaymentGateway } from '../src/lib/gateways';
import { dispatchRiderEarning, recordRiderEarning } from '../src/lib/riderPayouts';

const post = axios.post as unknown as ReturnType<typeof vi.fn>;
const request = axios.request as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  db.platformSettings.upsert.mockResolvedValue({ riderSharePercent: 70 });
});
afterEach(() => {
  delete process.env.GATEWAY_SPLIT_SETTLEMENT;
  delete process.env.MYIMO_API_URL;
  delete process.env.MYIMO_PUBLIC_KEY;
  delete process.env.MYIMO_MP_KEY;
});

describe('vendor share', () => {
  it('takes commission on the gas only, never the delivery fee', () => {
    // ₦10,000 gas + ₦2,000 delivery at 5% commission → vendor gets 9,500
    expect(vendorShare(12000, 2000, 5)).toBe(9500);
  });
});

describe('vendor earning', () => {
  const base = { id: 'o1', status: 'DELIVERED', vendorId: 'v1', vendor: { plan: 'BASIC' }, earning: null };

  it('records a gateway-settled order as SETTLED with what was really sent', async () => {
    db.order.findUnique.mockResolvedValue({
      ...base,
      totalAmount: 12000,
      deliveryFee: 2000,
      vendorSettledByGateway: true,
      vendorSplitAmount: 9500
    });
    await recordEarning('o1');
    const data = db.earning.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'SETTLED', grossAmount: 10000, netAmount: 9500, commissionAmount: 500 });
  });

  it('leaves an ordinary order AVAILABLE and excludes the delivery fee', async () => {
    db.order.findUnique.mockResolvedValue({
      ...base,
      totalAmount: 12000,
      deliveryFee: 2000,
      vendorSettledByGateway: false,
      vendorSplitAmount: null
    });
    await recordEarning('o1');
    const data = db.earning.create.mock.calls[0][0].data;
    expect(data.status).toBe('AVAILABLE');
    expect(data.grossAmount).toBe(10000);
  });

  it('keeps the old maths for orders placed before the fee was recorded', async () => {
    db.order.findUnique.mockResolvedValue({
      ...base,
      totalAmount: 12000,
      deliveryFee: 0,
      vendorSettledByGateway: false,
      vendorSplitAmount: null
    });
    await recordEarning('o1');
    expect(db.earning.create.mock.calls[0][0].data.grossAmount).toBe(12000);
  });
});

describe('planVendorSplit', () => {
  const order = { totalAmount: 12000, deliveryFee: 2000, vendorId: 'v1' };
  const fakeGateway = (over: Partial<PaymentGateway> = {}): PaymentGateway => ({
    id: 'FAKE',
    label: 'Fake',
    capabilities: { split: true },
    isConfigured: () => true,
    initialize: vi.fn(),
    verify: vi.fn(),
    ensureRecipient: vi.fn().mockResolvedValue('ACCT_new'),
    ...over
  });
  const bank = (recipients: object = {}) => ({
    id: 'b1',
    bankCode: '058',
    bankName: 'GTBank',
    accountNumber: '0123456789',
    accountName: 'ADA OKE',
    gatewayRecipients: recipients
  });

  beforeEach(() => {
    db.vendorProfile.findUnique.mockResolvedValue({
      plan: 'BASIC',
      businessName: 'Ada Gas',
      phone: '08000000000',
      user: { email: 'ada@example.com' }
    });
  });

  it('is off unless explicitly enabled', async () => {
    expect(await planVendorSplit(fakeGateway(), order)).toBeNull();
    expect(db.vendorBankAccount.findUnique).not.toHaveBeenCalled();
  });

  it('is skipped for gateways that cannot split, and for orders with no recorded fee', async () => {
    process.env.GATEWAY_SPLIT_SETTLEMENT = 'true';
    expect(await planVendorSplit(fakeGateway({ capabilities: { split: false } }), order)).toBeNull();
    expect(await planVendorSplit(fakeGateway(), { ...order, deliveryFee: 0 })).toBeNull();
  });

  it('does not block checkout when the vendor has no payout account', async () => {
    process.env.GATEWAY_SPLIT_SETTLEMENT = 'true';
    db.vendorBankAccount.findUnique.mockResolvedValue(null);
    expect(await planVendorSplit(fakeGateway(), order)).toBeNull();
  });

  it('registers the payee once and caches the code per gateway', async () => {
    process.env.GATEWAY_SPLIT_SETTLEMENT = 'true';
    const gw = fakeGateway();
    db.vendorBankAccount.findUnique.mockResolvedValue(bank({ OTHER: 'x' }));
    const plan = await planVendorSplit(gw, order);
    expect(plan).toEqual({ split: { legs: [{ recipientCode: 'ACCT_new', amountNaira: 9500 }] }, vendorAmount: 9500 });
    expect(gw.ensureRecipient).toHaveBeenCalledTimes(1);
    expect(db.vendorBankAccount.updateMany.mock.calls[0][0].data).toEqual({
      gatewayRecipients: { OTHER: 'x', FAKE: 'ACCT_new' }
    });
  });

  it('reuses a cached payee without calling the gateway', async () => {
    process.env.GATEWAY_SPLIT_SETTLEMENT = 'true';
    const gw = fakeGateway();
    db.vendorBankAccount.findUnique.mockResolvedValue(bank({ FAKE: 'ACCT_cached' }));
    const plan = await planVendorSplit(gw, order);
    expect(plan?.split.legs[0].recipientCode).toBe('ACCT_cached');
    expect(gw.ensureRecipient).not.toHaveBeenCalled();
  });

  it('falls back to a normal payment if the payee cannot be registered', async () => {
    process.env.GATEWAY_SPLIT_SETTLEMENT = 'true';
    db.vendorBankAccount.findUnique.mockResolvedValue(bank());
    const gw = fakeGateway({ ensureRecipient: vi.fn().mockRejectedValue(new Error('boom')) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await planVendorSplit(gw, order)).toBeNull();
  });
});

describe('Paystack split', () => {
  const input = {
    reference: '4FG-o1',
    amountNaira: 12000,
    customer: { email: 'c@example.com', name: 'C' },
    callbackUrl: 'https://cb',
    meta: { orderId: 'o1', supplierName: 'Ada Gas', cylinderSize: '12.5kg' }
  };

  it('sends the vendor subaccount with the platform share as a flat charge, platform bearing fees', async () => {
    post.mockResolvedValue({ data: { data: { reference: '4FG-o1', authorization_url: 'https://pay' } } });
    await paystackGateway.initialize({
      ...input,
      split: { legs: [{ recipientCode: 'ACCT_1', amountNaira: 9500 }] }
    });
    const body = post.mock.calls[0][1];
    expect(body).toMatchObject({ amount: 1_200_000, subaccount: 'ACCT_1', transaction_charge: 250_000, bearer: 'account' });
  });

  it('sends no subaccount fields for an ordinary payment', async () => {
    post.mockResolvedValue({ data: { data: { reference: '4FG-o1', authorization_url: 'https://pay' } } });
    await paystackGateway.initialize(input);
    expect(post.mock.calls[0][1]).not.toHaveProperty('subaccount');
  });

  it('refuses more than one payee', async () => {
    await expect(
      paystackGateway.initialize({
        ...input,
        split: {
          legs: [
            { recipientCode: 'A', amountNaira: 1 },
            { recipientCode: 'B', amountNaira: 1 }
          ]
        }
      })
    ).rejects.toThrow(/one payee/);
  });
});

describe('MyIMO split', () => {
  beforeEach(() => {
    process.env.MYIMO_API_URL = 'https://staging.example';
    process.env.MYIMO_PUBLIC_KEY = 'pk_test';
    process.env.MYIMO_MP_KEY = 'mp_test';
    request.mockReset();
  });
  const ok = (data: unknown) => ({ data: { header: { is_success: true }, data } });

  it('creates a one-off settlement order for the vendor, then initiates against it', async () => {
    request
      .mockResolvedValueOnce(ok('settlement-created'))
      .mockResolvedValueOnce(ok({ tx_reference: 'TX1', payment_link: 'https://pay', expires_on: 'x' }));
    const out = await myimoGateway.initialize({
      reference: '4FG-o1',
      amountNaira: 12000,
      customer: { email: 'c@example.com', name: 'C' },
      callbackUrl: 'https://cb',
      meta: { orderId: 'o1', supplierName: 'Ada Gas', cylinderSize: '12.5kg' },
      split: { legs: [{ recipientCode: 'sub-uuid', amountNaira: 9500 }] }
    });
    expect(out).toEqual({ reference: 'TX1', authorizationUrl: 'https://pay' });

    const [settlement, initiate] = request.mock.calls.map((c) => c[0]);
    expect(settlement.url).toContain('/vi/entities/merchant/settlements/orders/add');
    expect(settlement.data.order_items).toEqual([
      { subaccount_id: 'sub-uuid', is_settlement_fixed: true, fixed_amount: 9500, percent_amount: 0 }
    ]);
    expect(initiate.url).toContain('/vi/pay/initiate/split');
    expect(initiate.url).not.toContain('/gov/');
    expect(initiate.data.settlement_order_id).toBe(settlement.data.settlement_order_id);
    expect(initiate.data.amount).toBe(12000);

    // Settlement orders take the merchant key; the payment itself takes the public key.
    expect(settlement.headers['mp-key']).toBe('mp_test');
    expect(settlement.headers['xp-key']).toBeUndefined();
    expect(initiate.headers['xp-key']).toBe('pk_test');
    expect(initiate.headers['mp-key']).toBeUndefined();
  });

  it('refuses to register a new payee without contact details, before calling MyIMO', async () => {
    request.mockResolvedValueOnce(ok([]));
    await expect(
      myimoGateway.ensureRecipient!({
        name: 'Ada Gas',
        bankCode: '058',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'ADA OKE'
      })
    ).rejects.toThrow(/phone number and email/);
    expect(request).toHaveBeenCalledTimes(1); // the lookup only, no add
  });

  it('is unavailable, without a request, when the merchant key is not set', async () => {
    delete process.env.MYIMO_MP_KEY;
    await expect(
      myimoGateway.ensureRecipient!({
        name: 'Ada Gas',
        bankCode: '058',
        bankName: 'GTBank',
        accountNumber: '0123456789',
        accountName: 'ADA OKE'
      })
    ).rejects.toThrow(/temporarily unavailable/);
    expect(request).not.toHaveBeenCalled();
  });

  it('reuses an existing subaccount instead of registering the bank account twice', async () => {
    request.mockResolvedValueOnce(
      ok([{ identifier: 'sub-existing', bank_code: '058', account_number: '0123456789' }])
    );
    const code = await myimoGateway.ensureRecipient!({
      name: 'Ada Gas',
      bankCode: '058',
      bankName: 'GTBank',
      accountNumber: '0123456789',
      accountName: 'ADA OKE'
    });
    expect(code).toBe('sub-existing');
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('rider earning', () => {
  const delivered = { id: 'o1', status: 'DELIVERED', riderId: 'r1', deliveryFee: 2000, riderEarning: null };

  it("records the rider's share of the delivery fee", async () => {
    db.order.findUnique.mockResolvedValue(delivered);
    db.riderEarning.create.mockResolvedValue({ id: 're1' });
    expect(await recordRiderEarning('o1')).toBe('re1');
    expect(db.riderEarning.create.mock.calls[0][0].data).toMatchObject({
      riderId: 'r1',
      deliveryFee: 2000,
      sharePercent: 70,
      amount: 1400
    });
  });

  it('records nothing without a rider, a fee, a delivery, or when already recorded', async () => {
    for (const o of [
      { ...delivered, riderId: null },
      { ...delivered, deliveryFee: 0 },
      { ...delivered, status: 'CONFIRMED' },
      { ...delivered, riderEarning: { id: 'x' } }
    ]) {
      db.order.findUnique.mockResolvedValueOnce(o);
      expect(await recordRiderEarning('o1')).toBeNull();
    }
    expect(db.riderEarning.create).not.toHaveBeenCalled();
  });

  const earning = (bank: object | null, over: object = {}) => ({
    id: 're1',
    status: 'PENDING',
    reference: 'rider_ref',
    amount: 1400,
    accountNumber: null,
    accountName: null,
    rider: { bankAccount: bank, user: { isSuspended: false } },
    ...over
  });

  it('holds the earning as PENDING while the rider has no bank account', async () => {
    db.riderEarning.findUniqueOrThrow.mockResolvedValue(earning(null));
    ps.verifyTransfer.mockResolvedValue(null);
    db.riderEarning.update.mockResolvedValue({});
    await dispatchRiderEarning('re1');
    expect(ps.initiateTransfer).not.toHaveBeenCalled();
    expect(db.riderEarning.update.mock.calls[0][0].data.status).toBe('PENDING');
  });

  it('sends one transfer with the earning reference as the idempotency key', async () => {
    const bank = { id: 'rb1', bankCode: '058', bankName: 'GTBank', accountNumber: '0123456789', accountName: 'TUNDE', paystackRecipientCode: null };
    db.riderEarning.findUniqueOrThrow.mockResolvedValue(earning(bank));
    ps.verifyTransfer.mockResolvedValue(null);
    ps.createTransferRecipient.mockResolvedValue('RCP_1');
    ps.initiateTransfer.mockResolvedValue({ status: 'pending', transfer_code: 'TRF_1', reference: 'rider_ref' });
    db.riderEarning.update.mockResolvedValue({});
    await dispatchRiderEarning('re1');
    expect(ps.initiateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountNaira: 1400, recipientCode: 'RCP_1', reference: 'rider_ref' })
    );
  });

  it('does not send again when Paystack already has a transfer with that reference', async () => {
    db.riderEarning.findUniqueOrThrow.mockResolvedValue(earning({ id: 'rb1', accountNumber: '1' }));
    ps.verifyTransfer.mockResolvedValue({ status: 'success', transfer_code: 'TRF_1', reference: 'rider_ref' });
    db.riderEarning.update.mockResolvedValue({});
    await dispatchRiderEarning('re1');
    expect(ps.initiateTransfer).not.toHaveBeenCalled();
  });
});
