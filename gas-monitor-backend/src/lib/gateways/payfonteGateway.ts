import axios from 'axios';
import { GatewayError, type PaymentGateway } from './types';

/**
 * Payfonte hosted checkout. Reference: https://docs.payfonte.com
 *
 * Auth is a `client-id` + `client-secret` header pair from Dashboard → Settings →
 * Security → API Keys. Sandbox and live are separated only by `PAYFONTE_API_URL`
 * (sandbox https://sandbox-api.payfonte.com, live https://api.payfonte.com) and the
 * key pair; never mix them. The secret stays in server env and is never logged.
 *
 * Amounts are integer minor units (kobo). Paid means `status === 'success'` on the
 * verify endpoint and `amount` equal to the order total. Payfonte documents no
 * split/subaccount support, so `capabilities.split` is false.
 */

function config() {
  const baseUrl = (process.env.PAYFONTE_API_URL ?? '').trim().replace(/\/+$/, '');
  const clientId = (process.env.PAYFONTE_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.PAYFONTE_CLIENT_SECRET ?? '').trim();
  if (!baseUrl || !clientId || !clientSecret) {
    console.error('[payfonte] PAYFONTE_API_URL / PAYFONTE_CLIENT_ID / PAYFONTE_CLIENT_SECRET are not set');
    throw new GatewayError('Payment is temporarily unavailable');
  }
  return { baseUrl, headers: { 'client-id': clientId, 'client-secret': clientSecret, 'Content-Type': 'application/json' } };
}

export function payfonteConfigured(): boolean {
  return !!(
    process.env.PAYFONTE_API_URL?.trim() &&
    process.env.PAYFONTE_CLIENT_ID?.trim() &&
    process.env.PAYFONTE_CLIENT_SECRET?.trim()
  );
}

/** "08012345678" / "+2348012345678" → "2348012345678". Returns undefined if it is not a usable number. */
export function normalizeNgPhone(raw?: string | null): string | undefined {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (/^234\d{10}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `234${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) return `234${digits}`;
  return undefined;
}

const toKobo = (naira: number) => Math.round(naira * 100);

function failure(err: any, fallback: string): GatewayError {
  const detail = err?.response?.data;
  const message = typeof detail?.message === 'string' ? detail.message : fallback;
  console.error('[payfonte]', fallback, err?.response?.status ?? err?.message);
  return new GatewayError(message, !err?.response);
}

export const payfonteGateway: PaymentGateway = {
  id: 'PAYFONTE',
  label: 'Payfonte',
  capabilities: { split: false },

  isConfigured: payfonteConfigured,

  async initialize(input) {
    if (input.split) throw new GatewayError('Payfonte cannot split a payment');
    const { baseUrl, headers } = config();
    // Payfonte requires a phone number; fall back to an operator-set one for customers without one.
    const phoneNumber = normalizeNgPhone(input.customer.phone) ?? normalizeNgPhone(process.env.PAYFONTE_DEFAULT_PHONE);
    try {
      const { data } = await axios.post(
        `${baseUrl}/payments/v1/checkouts`,
        {
          reference: input.reference,
          amount: toKobo(input.amountNaira),
          currency: 'NGN',
          country: 'NG',
          // Per-transaction webhook takes priority over the dashboard setting. Needs API_PUBLIC_URL.
          ...(process.env.API_PUBLIC_URL?.trim()
            ? { webhook: `${process.env.API_PUBLIC_URL.trim().replace(/\/+$/, '')}/api/orders/webhook/payfonte` }
            : {}),
          redirectURL: input.callbackUrl,
          cancelURL: input.callbackUrl,
          user: {
            email: input.customer.email,
            name: input.customer.name,
            ...(phoneNumber ? { phoneNumber } : {})
          },
          metadata: {
            orderId: input.meta.orderId,
            supplierName: input.meta.supplierName,
            cylinderSize: input.meta.cylinderSize
          }
        },
        { headers, timeout: 20000 }
      );
      const url: string | undefined = data?.data?.url ?? data?.data?.shortURL;
      if (!url) throw new GatewayError('Payment initialization failed');
      return { reference: data.data.reference ?? input.reference, authorizationUrl: url };
    } catch (err: any) {
      if (err instanceof GatewayError) throw err;
      throw failure(err, 'Payment initialization failed');
    }
  },

  async verify(reference, expectedTotalNaira) {
    const { baseUrl, headers } = config();
    try {
      const { data } = await axios.get(`${baseUrl}/payments/v1/payments/verify/${encodeURIComponent(reference)}`, {
        headers,
        timeout: 20000
      });
      const tx = data?.data;
      const status: string = String(tx?.status ?? '').toLowerCase();
      if (status === 'failed') return { state: 'failed', status };
      if (status !== 'success') return { state: 'pending', status: status || 'pending' };
      // `amount` is what we asked to collect; `charge` is a fee on top that the customer may bear.
      if (Number(tx.amount) !== toKobo(expectedTotalNaira)) return { state: 'amount_mismatch', status };
      return { state: 'paid', status };
    } catch (err: any) {
      // Unknown reference (customer never reached checkout) is "not paid yet", not an outage.
      if (err?.response?.status === 404) return { state: 'pending', status: 'pending' };
      throw failure(err, 'Verification failed');
    }
  }
};
