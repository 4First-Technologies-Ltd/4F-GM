import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

import axios from 'axios';
import { enabledGateways } from '../src/lib/gateways';
import { normalizeNgPhone, payfonteGateway } from '../src/lib/gateways/payfonteGateway';

const post = axios.post as unknown as ReturnType<typeof vi.fn>;
const get = axios.get as unknown as ReturnType<typeof vi.fn>;

const ENV = ['PAYMENT_PROVIDERS', 'PAYMENT_PROVIDER', 'PAYFONTE_API_URL', 'PAYFONTE_CLIENT_ID', 'PAYFONTE_CLIENT_SECRET', 'MYIMO_API_URL', 'MYIMO_PUBLIC_KEY'];

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV) delete process.env[k];
  process.env.PAYFONTE_API_URL = 'https://sandbox.example/';
  process.env.PAYFONTE_CLIENT_ID = 'cid';
  process.env.PAYFONTE_CLIENT_SECRET = 'secret';
});
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

describe('checkout order', () => {
  it('lists Payfonte, MyIMO, Paystack in that order whatever the env order', () => {
    process.env.MYIMO_API_URL = 'https://m.example';
    process.env.MYIMO_PUBLIC_KEY = 'k';
    process.env.PAYMENT_PROVIDERS = 'paystack,myimo,payfonte';
    expect(enabledGateways().map((g) => g.id)).toEqual(['PAYFONTE', 'MYIMO', 'PAYSTACK']);
  });

  it('hides Payfonte without credentials', () => {
    delete process.env.PAYFONTE_CLIENT_SECRET;
    process.env.PAYMENT_PROVIDERS = 'payfonte,paystack';
    expect(enabledGateways().map((g) => g.id)).toEqual(['PAYSTACK']);
  });
});

describe('payfonte gateway', () => {
  it('normalises Nigerian phone numbers', () => {
    expect(normalizeNgPhone('0801 234 5678')).toBe('2348012345678');
    expect(normalizeNgPhone('+2348012345678')).toBe('2348012345678');
    expect(normalizeNgPhone('123')).toBeUndefined();
  });

  it('creates a checkout in kobo with the key headers', async () => {
    post.mockResolvedValue({ data: { data: { url: 'https://pay.example/x', reference: '4FG-1' } } });
    const out = await payfonteGateway.initialize({
      reference: '4FG-1',
      amountNaira: 5000.5,
      customer: { email: 'a@b.co', name: 'Ada', phone: '08012345678' },
      callbackUrl: 'https://cb.example',
      meta: { orderId: '1', supplierName: 'S', cylinderSize: '6kg' }
    });
    expect(out).toEqual({ reference: '4FG-1', authorizationUrl: 'https://pay.example/x' });
    const [url, body, opts] = post.mock.calls[0];
    expect(url).toBe('https://sandbox.example/payments/v1/checkouts');
    expect(body.amount).toBe(500050);
    expect(body.user.phoneNumber).toBe('2348012345678');
    expect(opts.headers['client-id']).toBe('cid');
  });

  it('verifies paid, mismatch, pending and failed', async () => {
    const tx = (o: object) => get.mockResolvedValueOnce({ data: { data: o } });
    tx({ status: 'success', amount: 500000 });
    expect((await payfonteGateway.verify('r', 5000)).state).toBe('paid');
    tx({ status: 'success', amount: 100 });
    expect((await payfonteGateway.verify('r', 5000)).state).toBe('amount_mismatch');
    tx({ status: 'pending' });
    expect((await payfonteGateway.verify('r', 5000)).state).toBe('pending');
    tx({ status: 'failed' });
    expect((await payfonteGateway.verify('r', 5000)).state).toBe('failed');
  });
});
