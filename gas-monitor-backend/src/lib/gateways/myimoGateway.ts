import {
  MYIMO_STATUS,
  MyimoError,
  createSettlementOrder,
  ensureSubaccount,
  initiatePayment,
  initiateSplitPayment,
  isPaidInFull,
  myimoConfigured,
  verifyPayment
} from '../myimo';
import { GatewayError, type PaymentGateway } from './types';

export const myimoGateway: PaymentGateway = {
  id: 'MYIMO',
  label: 'MyIMO Pay',
  capabilities: { split: true },

  isConfigured: myimoConfigured,

  async initialize(input) {
    try {
      if (input.split) {
        const settlementOrderId = await createSettlementOrder({
          name: `order ${input.meta.orderId}`,
          legs: input.split.legs.map((l) => ({ subaccountId: l.recipientCode, amountNaira: l.amountNaira }))
        });
        const s = await initiateSplitPayment({
          settlementOrderId,
          reference: input.reference,
          amountNaira: input.amountNaira,
          customerName: input.customer.name,
          customerEmail: input.customer.email,
          callbackUrl: input.callbackUrl
        });
        return { reference: s.txReference, authorizationUrl: s.paymentLink };
      }
      const m = await initiatePayment({
        reference: input.reference,
        amountNaira: input.amountNaira,
        customerName: input.customer.name,
        customerEmail: input.customer.email,
        callbackUrl: input.callbackUrl
      });
      return { reference: m.txReference, authorizationUrl: m.paymentLink };
    } catch (err) {
      throw new GatewayError(
        err instanceof MyimoError ? err.message : 'Payment initialization failed',
        err instanceof MyimoError && err.indeterminate
      );
    }
  },

  async ensureRecipient(account) {
    try {
      return await ensureSubaccount(account); // carries email/phone, which MyIMO requires
    } catch (err) {
      throw new GatewayError(
        err instanceof MyimoError ? err.message : 'Could not set up the payout account',
        err instanceof MyimoError && err.indeterminate
      );
    }
  },

  async verify(reference, expectedTotalNaira) {
    try {
      const tx = await verifyPayment(reference);
      if (isPaidInFull(tx, expectedTotalNaira)) return { state: 'paid' };
      if (tx.status === MYIMO_STATUS.SUCCESS) return { state: 'amount_mismatch' };
      const failed = tx.status === MYIMO_STATUS.FAILED || tx.status === MYIMO_STATUS.EXPIRED;
      return { state: failed ? 'failed' : 'pending' };
    } catch (err) {
      throw new GatewayError(
        err instanceof MyimoError ? err.message : 'Verification failed',
        !(err instanceof MyimoError) || err.indeterminate
      );
    }
  }
};
