import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import {
  MYIMO_STATUS,
  MyimoError,
  initiatePayment,
  isPaidInFull,
  myimoConfigured,
  verifyPayment
} from '../src/lib/myimo';
import { defaultGateway, enabledGateways, resolveGateway } from '../src/lib/gateways';

const enabledProviders = () => enabledGateways().map((g) => g.id);
const defaultProvider = () => defaultGateway().id;
const resolveProvider = (r?: string) => resolveGateway(r)?.id ?? null;

vi.mock('axios', async (orig) => {
  const real = await orig<typeof import('axios')>();
  return { ...real, default: { ...real.default, request: vi.fn(), isAxiosError: real.default.isAxiosError } };
});

const request = axios.request as unknown as ReturnType<typeof vi.fn>;
const KEY = 'pk_test_not_a_real_key';

beforeEach(() => {
  process.env.MYIMO_API_URL = 'https://staging.example/';
  process.env.MYIMO_PUBLIC_KEY = KEY;
  request.mockReset();
});

afterEach(() => {
  delete process.env.MYIMO_API_URL;
  delete process.env.MYIMO_PUBLIC_KEY;
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PROVIDERS;
});

const ok = (data: unknown) => ({ data: { header: { is_success: true }, data } });

describe('provider switch', () => {
  it('offers only Paystack until MyIMO is enabled', () => {
    expect(enabledProviders()).toEqual(['PAYSTACK']);
    expect(defaultProvider()).toBe('PAYSTACK');
    expect(resolveProvider()).toBe('PAYSTACK');
    expect(resolveProvider('myimo')).toBeNull(); // configured but not enabled
  });

  it('lets the customer pick any enabled gateway, case-insensitively', () => {
    process.env.PAYMENT_PROVIDERS = 'paystack, myimo';
    expect(enabledProviders()).toEqual(['PAYSTACK', 'MYIMO']);
    expect(resolveProvider('MyIMO')).toBe('MYIMO');
    expect(resolveProvider('paystack')).toBe('PAYSTACK');
  });

  it('uses the preselected default when the client sends no choice', () => {
    process.env.PAYMENT_PROVIDERS = 'paystack,myimo';
    process.env.PAYMENT_PROVIDER = 'myimo';
    expect(resolveProvider()).toBe('MYIMO');
    process.env.PAYMENT_PROVIDER = 'stripe'; // junk falls back to the first enabled
    expect(defaultProvider()).toBe('PAYSTACK');
  });

  it('refuses unknown gateways', () => {
    process.env.PAYMENT_PROVIDERS = 'paystack,myimo';
    expect(resolveProvider('stripe')).toBeNull();
  });

  it('never offers MyIMO without credentials, even if listed', () => {
    process.env.PAYMENT_PROVIDERS = 'paystack,myimo';
    delete process.env.MYIMO_PUBLIC_KEY;
    expect(enabledProviders()).toEqual(['PAYSTACK']);
    expect(resolveProvider('myimo')).toBeNull();
  });

  it('keeps the old single-switch setting working', () => {
    process.env.PAYMENT_PROVIDER = 'myimo';
    expect(enabledProviders()).toEqual(['MYIMO']);
    expect(defaultProvider()).toBe('MYIMO');
  });

  it('reports whether the credentials are present', () => {
    expect(myimoConfigured()).toBe(true);
    delete process.env.MYIMO_PUBLIC_KEY;
    expect(myimoConfigured()).toBe(false);
  });
});

describe('initiatePayment', () => {
  it('posts to /vi/pay/initiate with the xp-key header and maps the response', async () => {
    request.mockResolvedValue(
      ok({ tx_reference: '4FG-1', payment_link: 'https://pay.example/x', expires_on: '2026-10-29T10:00:00Z' })
    );
    const out = await initiatePayment({
      reference: '4FG-1',
      amountNaira: 100,
      customerName: 'Ada',
      customerEmail: 'ada@example.com',
      callbackUrl: 'https://cb.local/x'
    });
    expect(out).toEqual({ txReference: '4FG-1', paymentLink: 'https://pay.example/x', expiresOn: '2026-10-29T10:00:00Z' });

    const call = request.mock.calls[0][0];
    expect(call.method).toBe('post');
    expect(call.url).toBe('https://staging.example/vi/pay/initiate'); // trailing slash trimmed
    expect(call.headers['xp-key']).toBe(KEY);
    expect(call.data).toMatchObject({ tx_ref: '4FG-1', amount: 100, currency: 'NGN', customer_full_name: 'Ada' });
    expect(call.url).not.toContain('/gov/');
  });

  it('fails without calling out when not configured, and does not name env vars to the customer', async () => {
    delete process.env.MYIMO_PUBLIC_KEY;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await initiatePayment({ reference: 'r', amountNaira: 1, customerName: 'A' }).catch((e) => e);
    expect(err).toBeInstanceOf(MyimoError);
    expect(err.message).not.toMatch(/MYIMO_/);
    expect(request).not.toHaveBeenCalled();
  });

  it('surfaces the API remark on a 4xx and marks a 5xx or no-answer as indeterminate', async () => {
    const http = (status: number, remark: string) =>
      Object.assign(new Error('boom'), { isAxiosError: true, response: { status, data: { header: { remark } } } });

    request.mockRejectedValueOnce(http(400, 'reference too long'));
    const e400 = await initiatePayment({ reference: 'r', amountNaira: 1, customerName: 'A' }).catch((e) => e);
    expect(e400.message).toBe('reference too long');
    expect(e400.indeterminate).toBe(false);

    request.mockRejectedValueOnce(http(500, 'provider down'));
    const e500 = await initiatePayment({ reference: 'r', amountNaira: 1, customerName: 'A' }).catch((e) => e);
    expect(e500.indeterminate).toBe(true);

    request.mockRejectedValueOnce(Object.assign(new Error('timeout'), { isAxiosError: true }));
    const eNone = await initiatePayment({ reference: 'r', amountNaira: 1, customerName: 'A' }).catch((e) => e);
    expect(eNone.indeterminate).toBe(true);
  });

  it('never puts the public key in an error message', async () => {
    request.mockRejectedValueOnce(
      Object.assign(new Error(`failed with header xp-key ${KEY}`), { isAxiosError: true, response: { status: 403, data: null } })
    );
    const err = await initiatePayment({ reference: 'r', amountNaira: 1, customerName: 'A' }).catch((e) => e);
    // Falls back to the transport message only when the API gave none; that text is
    // axios' own and carries the status, not our headers.
    expect(err).toBeInstanceOf(MyimoError);
    expect(err.httpStatus).toBe(403);
  });
});

describe('verifyPayment', () => {
  it('GETs /vi/pay/verify/{ref} with the key and parses string amounts', async () => {
    request.mockResolvedValue(
      ok({ tx_reference: '4FG-1', status: 2, initial_amount: '100', charged_amount: 101.5, paid_amount: '101.5' })
    );
    const tx = await verifyPayment('4FG-1');
    expect(tx).toEqual({ txReference: '4FG-1', status: 2, initialAmount: 100, chargedAmount: 101.5, paidAmount: 101.5 });
    const call = request.mock.calls[0][0];
    expect(call.method).toBe('get');
    expect(call.url).toBe('https://staging.example/vi/pay/verify/4FG-1');
    expect(call.headers['xp-key']).toBe(KEY);
  });

  it('treats an unsuccessful envelope as an error', async () => {
    request.mockResolvedValue({ data: { header: { is_success: false, remark: 'not found' }, data: null } });
    await expect(verifyPayment('x')).rejects.toThrow('not found');
  });
});

describe('isPaidInFull', () => {
  const tx = (o: Partial<Parameters<typeof isPaidInFull>[0]> = {}) => ({
    txReference: 'r', status: MYIMO_STATUS.SUCCESS, initialAmount: 5000, chargedAmount: 5000, paidAmount: 5000, ...o
  });

  it('accepts a successful payment for exactly the order total', () => {
    expect(isPaidInFull(tx(), 5000)).toBe(true);
  });

  it('accepts fees borne by the customer on top of the order total', () => {
    expect(isPaidInFull(tx({ chargedAmount: 5075, paidAmount: 5075 }), 5000)).toBe(true);
  });

  it('rejects anything not final-successful', () => {
    for (const status of [MYIMO_STATUS.INITIATED, MYIMO_STATUS.PENDING, MYIMO_STATUS.FAILED, MYIMO_STATUS.EXPIRED]) {
      expect(isPaidInFull(tx({ status }), 5000)).toBe(false);
    }
  });

  it('rejects a transaction for a different amount than the order', () => {
    expect(isPaidInFull(tx({ initialAmount: 50, chargedAmount: 50, paidAmount: 50 }), 5000)).toBe(false);
  });

  it('rejects an underpayment', () => {
    expect(isPaidInFull(tx({ paidAmount: 4999 }), 5000)).toBe(false);
    expect(isPaidInFull(tx({ chargedAmount: 5075, paidAmount: 5000 }), 5000)).toBe(false);
  });

  it('is not fooled by floating point', () => {
    expect(isPaidInFull(tx({ initialAmount: 0.1 + 0.2, chargedAmount: 0.3, paidAmount: 0.3 }), 0.3)).toBe(true);
  });
});
