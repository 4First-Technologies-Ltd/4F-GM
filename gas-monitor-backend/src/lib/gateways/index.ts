import { paystackGateway } from './paystackGateway';
import { myimoGateway } from './myimoGateway';
import type { PaymentGateway } from './types';

export * from './types';

/**
 * Every gateway the code knows about. To add one: write an adapter that
 * implements `PaymentGateway`, add it here, and list its id in `PAYMENT_PROVIDERS`.
 * A gateway whose credentials are missing is never offered to customers.
 *
 * Env:
 *  - `PAYMENT_PROVIDERS`  comma list of enabled gateway ids, e.g. `paystack,myimo`
 *    (default: Paystack only).
 *  - `PAYMENT_PROVIDER`   the one pre-selected, and the fallback for old clients
 *    that send no choice (default: the first enabled).
 *
 * Each order stores the id it started with (`Order.paymentProvider`), so
 * verification always asks that gateway, whatever the env says later.
 *
 * Vendor/rider payout transfers are a separate concern and still use Paystack
 * Transfers; see `lib/payouts.ts`.
 */
const ALL: PaymentGateway[] = [paystackGateway, myimoGateway];

const byId = new Map(ALL.map((g) => [g.id, g]));

/** The gateway an order was started on, regardless of whether it is still enabled. */
export function getGateway(id: string): PaymentGateway | null {
  return byId.get(id.trim().toUpperCase()) ?? null;
}

export function enabledGateways(): PaymentGateway[] {
  const raw = process.env.PAYMENT_PROVIDERS ?? process.env.PAYMENT_PROVIDER ?? 'paystack';
  const wanted = raw.split(',').map((s) => getGateway(s)).filter((g): g is PaymentGateway => g !== null);
  const usable = [...new Set(wanted)].filter((g) => g.isConfigured());
  return usable.length ? usable : [paystackGateway];
}

export function defaultGateway(): PaymentGateway {
  const enabled = enabledGateways();
  const wanted = getGateway(process.env.PAYMENT_PROVIDER ?? '');
  return wanted && enabled.includes(wanted) ? wanted : enabled[0];
}

/** The customer's choice if it is enabled, the default when they sent none, otherwise null. */
export function resolveGateway(requested?: string): PaymentGateway | null {
  if (!requested) return defaultGateway();
  const g = getGateway(requested);
  return g && enabledGateways().includes(g) ? g : null;
}
