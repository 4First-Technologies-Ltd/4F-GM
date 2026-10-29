import { randomUUID } from 'crypto';
import axios from 'axios';

/**
 * MyIMO Pay collection client. Reference: the staging OpenAPI document at
 * https://apipg.demo.myimopay.com/openapi/v1.json (the /api-docs page renders it).
 *
 * Staging and live are separated purely by environment: point `MYIMO_API_URL` and
 * `MYIMO_PUBLIC_KEY` at one or the other. The public key is sent as the `xp-key`
 * header on every call, lives only in server env, and is never logged or returned.
 *
 * Only the direct-payment endpoints are used. The government endpoint
 * (`/vi/pay/initiate/gov/...`) must never be called from this integration.
 */

/** Numeric `status` on a MyIMO transaction. */
export const MYIMO_STATUS = { INITIATED: 0, PENDING: 1, SUCCESS: 2, FAILED: 3, EXPIRED: 4 } as const;

export class MyimoError extends Error {
  /** True when we got no answer at all, so the request may or may not have landed. */
  readonly indeterminate: boolean;
  readonly httpStatus?: number;
  constructor(message: string, indeterminate: boolean, httpStatus?: number) {
    super(message);
    this.indeterminate = indeterminate;
    this.httpStatus = httpStatus;
  }
}

export interface MyimoInitiated {
  txReference: string;
  paymentLink: string;
  expiresOn: string;
}

export interface MyimoTransaction {
  txReference: string;
  status: number;
  /** What we asked to collect, in naira. */
  initialAmount: number;
  /** What the customer was asked to pay (initial + any fees they bear), in naira. */
  chargedAmount: number;
  /** What the customer actually paid, in naira. */
  paidAmount: number;
}

interface Envelope<T> {
  header?: { is_success?: boolean; status?: string | null; remark?: string | null };
  data?: T | null;
}

interface Config {
  baseUrl: string;
  publicKey: string;
}

/** Read per call so tests and env changes take effect without a restart-time constant. */
function config(): Config {
  const baseUrl = (process.env.MYIMO_API_URL ?? '').trim().replace(/\/+$/, '');
  const publicKey = (process.env.MYIMO_PUBLIC_KEY ?? '').trim();
  if (!baseUrl || !publicKey) {
    // Operator detail goes to the log; the message is what a customer may see.
    console.error('[myimo] MYIMO_API_URL / MYIMO_PUBLIC_KEY are not set');
    throw new MyimoError('Payment is temporarily unavailable', false);
  }
  return { baseUrl, publicKey };
}

export function myimoConfigured(): boolean {
  return !!(process.env.MYIMO_API_URL?.trim() && process.env.MYIMO_PUBLIC_KEY?.trim());
}

/**
 * Which credential an endpoint wants. Payments take the public key (`xp-key`); the
 * merchant "entities" endpoints (subaccounts, settlement orders) take a separate
 * merchant key in `mp-key`, per the spec. Neither is ever logged or returned.
 */
type Auth = 'public' | 'merchant';

async function call<T>(method: 'get' | 'post', path: string, body?: unknown, auth: Auth = 'public'): Promise<T> {
  const { baseUrl, publicKey } = config();
  let credential: Record<string, string>;
  if (auth === 'merchant') {
    const mpKey = (process.env.MYIMO_MP_KEY ?? '').trim();
    if (!mpKey) {
      console.error('[myimo] MYIMO_MP_KEY is not set; subaccounts and settlement orders need it');
      throw new MyimoError('Payment is temporarily unavailable', false);
    }
    credential = { 'mp-key': mpKey };
  } else {
    credential = { 'xp-key': publicKey };
  }
  try {
    const { data } = await axios.request<Envelope<T>>({
      method,
      url: `${baseUrl}${path}`,
      data: body,
      headers: { 'Content-Type': 'application/json', ...credential },
      timeout: 20_000
    });
    if (data?.header?.is_success === false || data?.data == null) {
      throw new MyimoError(data?.header?.remark || data?.header?.status || 'MyIMO Pay request failed', false);
    }
    return data.data;
  } catch (err) {
    if (err instanceof MyimoError) throw err;
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const env = err.response.data as Envelope<string> | undefined;
        const message = env?.header?.remark || (typeof env?.data === 'string' ? env.data : '') || err.message;
        // 5xx may have been processed before failing; 4xx definitely was not.
        throw new MyimoError(message, err.response.status >= 500, err.response.status);
      }
      throw new MyimoError('MyIMO Pay did not respond', true);
    }
    throw err;
  }
}

export async function initiatePayment(input: {
  reference: string;
  amountNaira: number;
  customerName: string;
  customerEmail?: string;
  customerMobile?: string;
  callbackUrl?: string;
}): Promise<MyimoInitiated> {
  const d = await call<{ tx_reference: string; payment_link: string; expires_on: string }>('post', '/vi/pay/initiate', {
    tx_ref: input.reference,
    amount: input.amountNaira,
    currency: 'NGN',
    customer_full_name: input.customerName,
    customer_email: input.customerEmail,
    customer_mobile: input.customerMobile,
    callback_url: input.callbackUrl
  });
  return { txReference: d.tx_reference, paymentLink: d.payment_link, expiresOn: d.expires_on };
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

/** Asks MyIMO for the transaction; it refreshes a non-final status from the provider itself. */
export async function verifyPayment(reference: string): Promise<MyimoTransaction> {
  const d = await call<{
    tx_reference: string;
    status: number;
    initial_amount: number | string;
    charged_amount: number | string;
    paid_amount: number | string;
  }>('get', `/vi/pay/verify/${encodeURIComponent(reference)}`);
  return {
    txReference: d.tx_reference,
    status: d.status,
    initialAmount: num(d.initial_amount),
    chargedAmount: num(d.charged_amount),
    paidAmount: num(d.paid_amount)
  };
}

/**
 * True only for a finished, fully paid transaction for exactly this order total.
 * Any fee the customer bears is on top of the total, so the customer may pay
 * more than the order amount but never less than what MyIMO asked of them.
 */
export function isPaidInFull(tx: MyimoTransaction, orderTotalNaira: number): boolean {
  const cents = (n: number) => Math.round(n * 100);
  return (
    tx.status === MYIMO_STATUS.SUCCESS &&
    cents(tx.initialAmount) === cents(orderTotalNaira) &&
    cents(tx.paidAmount) >= cents(tx.initialAmount) &&
    cents(tx.paidAmount) >= cents(tx.chargedAmount)
  );
}

// ── Split settlement ─────────────────────────────────────────────────────────
// A split pays other parties out of one collection. MyIMO does it with a
// *settlement order* (a list of subaccount amounts) that the payment references.
// The semantics of `settle_merchant` / `charge_bearer` below follow the OpenAPI
// document and have not been checked against staging yet.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MyimoSubaccount {
  identifier: string;
  account_number: string;
  bank_code: string;
}

async function findSubaccount(bankCode: string, accountNumber: string): Promise<string | null> {
  const all = await call<MyimoSubaccount[]>('get', '/vi/entities/merchant/subaccounts/accounts', undefined, 'merchant');
  return all.find((s) => s.bank_code === bankCode && s.account_number === accountNumber)?.identifier ?? null;
}

/**
 * Makes sure a bank account exists as a MyIMO subaccount and returns the id a
 * settlement order refers to. MyIMO refuses a duplicate (same bank and number), so
 * it looks first. This sends real bank details to MyIMO's provider.
 */
export async function ensureSubaccount(input: {
  name: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** The spec requires both for a new subaccount. */
  email?: string;
  phone?: string;
}): Promise<string> {
  const existing = await findSubaccount(input.bankCode, input.accountNumber);
  if (existing) return existing;
  if (!input.email || !input.phone) {
    throw new MyimoError('A phone number and email are needed to set up the payout account', false);
  }

  await call<string>(
    'post',
    '/vi/entities/merchant/subaccounts/accounts/add',
    {
      sub_name: input.name.slice(0, 60),
      bank_code: input.bankCode,
      bank_name: input.bankName,
      account_number: input.accountNumber,
      account_name: input.accountName,
      currency: 'NGN',
      email_address: input.email,
      phone_number: input.phone
    },
    'merchant'
  );
  const created = await findSubaccount(input.bankCode, input.accountNumber);
  if (!created || !UUID.test(created)) throw new MyimoError('Could not set up the payout account', false);
  return created;
}

/**
 * One settlement order per payment: each payee gets a fixed naira amount and the
 * rest of the collection stays with the merchant (the platform). Returns the id we
 * assigned, which `initiateSplitPayment` takes.
 */
export async function createSettlementOrder(input: {
  name: string;
  legs: { subaccountId: string; amountNaira: number }[];
}): Promise<string> {
  const id = randomUUID();
  await call<string>(
    'post',
    '/vi/entities/merchant/settlements/orders/add',
    {
      settlement_order_id: id,
      settlement_name: input.name.slice(0, 60),
      settle_merchant: true,
      override_charge_bearer: true,
      charge_bearer: 1, // 1 = merchant bears the fees, so each payee gets their full fixed amount
      is_mixed_settlement: false,
      order_items: input.legs.map((l) => ({
        subaccount_id: l.subaccountId,
        is_settlement_fixed: true,
        fixed_amount: l.amountNaira,
        percent_amount: 0
      }))
    },
    'merchant'
  );
  return id;
}

export async function initiateSplitPayment(input: {
  settlementOrderId: string;
  reference: string;
  amountNaira: number;
  customerName: string;
  customerEmail?: string;
  callbackUrl?: string;
}): Promise<MyimoInitiated> {
  const d = await call<{ tx_reference: string; payment_link: string; expires_on: string }>('post', '/vi/pay/initiate/split', {
    settlement_order_id: input.settlementOrderId,
    tx_ref: input.reference,
    amount: input.amountNaira,
    currency: 'NGN',
    customer_full_name: input.customerName,
    customer_email: input.customerEmail,
    callback_url: input.callbackUrl
  });
  return { txReference: d.tx_reference, paymentLink: d.payment_link, expiresOn: d.expires_on };
}
