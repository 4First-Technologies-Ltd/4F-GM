import axios from 'axios';

export const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';
export const PAYSTACK_BASE = 'https://api.paystack.co';
// Intercept-only URL — the mobile WebView blocks navigation to it and extracts the reference
export const CALLBACK_URL = 'https://4fgmonitor.app.local/payment-callback';

export function paystackHeaders() {
  return { Authorization: `Bearer ${PAYSTACK_SECRET}` };
}

/** Kobo is the unit Paystack speaks; the rest of the app uses naira. */
export const toKobo = (naira: number) => Math.round(naira * 100);

export interface PaystackBank {
  name: string;
  code: string;
}

export class PaystackError extends Error {
  /** True when we got no answer at all, so the request may or may not have landed. */
  readonly indeterminate: boolean;
  constructor(message: string, indeterminate: boolean) {
    super(message);
    this.indeterminate = indeterminate;
  }
}

async function call<T>(fn: () => Promise<{ data: { status: boolean; message: string; data: T } }>): Promise<T> {
  try {
    const { data } = await fn();
    if (!data.status) throw new PaystackError(data.message, false);
    return data.data;
  } catch (err) {
    if (err instanceof PaystackError) throw err;
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const message = (err.response.data as { message?: string } | undefined)?.message ?? err.message;
        // 5xx may have been processed before failing; 4xx definitely was not.
        throw new PaystackError(message, err.response.status >= 500);
      }
      throw new PaystackError(err.message, true);
    }
    throw err;
  }
}

let bankCache: { at: number; banks: PaystackBank[] } | null = null;

export async function listBanks(): Promise<PaystackBank[]> {
  if (bankCache && Date.now() - bankCache.at < 24 * 60 * 60 * 1000) return bankCache.banks;
  const rows = await call<Array<{ name: string; code: string; active: boolean }>>(() =>
    axios.get(`${PAYSTACK_BASE}/bank`, {
      headers: paystackHeaders(),
      params: { country: 'nigeria', currency: 'NGN', perPage: 200 }
    })
  );
  const banks = rows
    .filter((b) => b.active)
    .map(({ name, code }) => ({ name, code }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

export async function resolveAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }> {
  const data = await call<{ account_name: string }>(() =>
    axios.get(`${PAYSTACK_BASE}/bank/resolve`, {
      headers: paystackHeaders(),
      params: { account_number: accountNumber, bank_code: bankCode }
    })
  );
  return { accountName: data.account_name };
}

export async function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<string> {
  const data = await call<{ recipient_code: string }>(() =>
    axios.post(
      `${PAYSTACK_BASE}/transferrecipient`,
      { type: 'nuban', name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: 'NGN' },
      { headers: paystackHeaders() }
    )
  );
  return data.recipient_code;
}

export interface PaystackTransfer {
  transfer_code: string;
  status: string;
  reference: string;
}

export async function initiateTransfer(input: {
  amountNaira: number;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<PaystackTransfer> {
  return call<PaystackTransfer>(() =>
    axios.post(
      `${PAYSTACK_BASE}/transfer`,
      {
        source: 'balance',
        amount: toKobo(input.amountNaira),
        recipient: input.recipientCode,
        reference: input.reference,
        reason: input.reason
      },
      { headers: paystackHeaders() }
    )
  );
}

/** Returns null when Paystack has no transfer with this reference. */
export async function verifyTransfer(reference: string): Promise<PaystackTransfer | null> {
  try {
    return await call<PaystackTransfer>(() =>
      axios.get(`${PAYSTACK_BASE}/transfer/verify/${encodeURIComponent(reference)}`, { headers: paystackHeaders() })
    );
  } catch (err) {
    if (err instanceof PaystackError && !err.indeterminate && /not found/i.test(err.message)) return null;
    throw err;
  }
}
