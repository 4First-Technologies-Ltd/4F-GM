/**
 * The contract every payment gateway implements. Orders talk only to this, so
 * adding a gateway means writing one adapter and registering it in `./index.ts`;
 * nothing in the order routes changes.
 */

/** Thrown by adapters. `message` is safe to show a customer. */
export class GatewayError extends Error {
  /** True when we got no answer at all, so the request may or may not have landed. */
  readonly indeterminate: boolean;
  constructor(message: string, indeterminate = false) {
    super(message);
    this.indeterminate = indeterminate;
  }
}

/**
 * Money that is paid out to someone at the moment of payment, instead of landing
 * with the platform. Whatever is not in a leg stays with the platform (commission,
 * delivery fee, gateway fees). `recipientCode` is the gateway's own id for the
 * payee (a Paystack subaccount code, a MyIMO subaccount id, ...).
 */
export interface SplitLeg {
  recipientCode: string;
  amountNaira: number;
}

export interface PaymentSplit {
  legs: SplitLeg[];
}

export interface InitializeInput {
  /** Our reference for the order. The gateway may return a different one; store what comes back. */
  reference: string;
  amountNaira: number;
  customer: { email: string; name: string };
  callbackUrl: string;
  /** Order details for the gateway's own dashboard. */
  meta: { orderId: string; supplierName: string; cylinderSize: string; guestCheckout?: boolean };
  /** Only passed to gateways with `capabilities.split`. */
  split?: PaymentSplit;
}

export interface StartedPayment {
  /** What to store on the order and verify with later. */
  reference: string;
  /** Where the customer pays. */
  authorizationUrl: string;
}

export type VerifyState =
  /** Finished, and the amount collected matches the order. */
  | 'paid'
  /** Not finished: the customer may still be paying. */
  | 'pending'
  /** Finished without payment (failed, expired, reversed). */
  | 'failed'
  /** Money was taken, but not the order's amount. Never confirm. */
  | 'amount_mismatch';

export interface VerifyResult {
  state: VerifyState;
  /** The gateway's own status word, passed through to clients for display/debugging. */
  status?: string;
}

export interface GatewayCapabilities {
  /** Can pay other parties out of a collection at payment time (`InitializeInput.split`). */
  split: boolean;
}

/** A bank account to register with a gateway as a payee. The name is already resolved by the bank. */
export interface RecipientAccount {
  /** Label shown on the gateway's side, e.g. the vendor's business name. */
  name: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  /** Contact for the payee; some gateways (MyIMO) require both to register one. */
  email?: string;
  phone?: string;
}

export interface PaymentGateway {
  /** Stored on `Order.paymentProvider`, upper-case, e.g. `PAYSTACK`. Never change once orders exist. */
  readonly id: string;
  readonly label: string;
  readonly capabilities: GatewayCapabilities;
  /** False when credentials are missing: the gateway is then never offered. */
  isConfigured(): boolean;
  initialize(input: InitializeInput): Promise<StartedPayment>;
  /**
   * Registers a bank account as a payee and returns the code to put in a
   * `SplitLeg`. Present when `capabilities.split` is true. This sends real bank
   * details to the gateway, so callers cache the code (see `lib/settlement.ts`).
   */
  ensureRecipient?(account: RecipientAccount): Promise<string>;
  /** Asks the gateway about a reference and compares the amount with `expectedTotalNaira`. */
  verify(reference: string, expectedTotalNaira: number): Promise<VerifyResult>;
}
