import axios from 'axios';
import { PAYSTACK_BASE, PaystackError, createSubaccount, paystackHeaders, toKobo } from '../paystack';
import { GatewayError, type PaymentGateway } from './types';

export const paystackGateway: PaymentGateway = {
  id: 'PAYSTACK',
  label: 'Paystack',
  capabilities: { split: true },

  // The built-in gateway and the fallback when nothing else is usable: always offered.
  isConfigured: () => true,

  async initialize(input) {
    // Paystack pays one subaccount per transaction. Everything outside its flat share
    // (commission, delivery fee) stays with the platform, which also bears Paystack's fee.
    if (input.split && input.split.legs.length !== 1) {
      throw new GatewayError('Paystack can split a payment to one payee only');
    }
    const leg = input.split?.legs[0];
    try {
      const { data: ps } = await axios.post(
        `${PAYSTACK_BASE}/transaction/initialize`,
        {
          email: input.customer.email,
          amount: toKobo(input.amountNaira),
          reference: input.reference,
          callback_url: input.callbackUrl,
          ...(leg
            ? {
                subaccount: leg.recipientCode,
                transaction_charge: toKobo(input.amountNaira - leg.amountNaira),
                bearer: 'account'
              }
            : {}),
          metadata: {
            orderId: input.meta.orderId,
            supplierName: input.meta.supplierName,
            cylinderSize: input.meta.cylinderSize,
            ...(input.meta.guestCheckout ? { guestCheckout: true } : {}),
            custom_fields: [
              { display_name: 'Order ID', variable_name: 'order_id', value: input.meta.orderId },
              { display_name: 'Supplier', variable_name: 'supplier_name', value: input.meta.supplierName },
              { display_name: 'Cylinder Size', variable_name: 'cylinder_size', value: input.meta.cylinderSize }
            ]
          }
        },
        { headers: paystackHeaders() }
      );
      return { reference: ps.data.reference, authorizationUrl: ps.data.authorization_url };
    } catch (err: any) {
      throw new GatewayError(err?.response?.data?.message ?? 'Payment initialization failed', !err?.response);
    }
  },

  async ensureRecipient(account) {
    try {
      return await createSubaccount({
        businessName: account.name,
        bankCode: account.bankCode,
        accountNumber: account.accountNumber
      });
    } catch (err) {
      throw new GatewayError(
        err instanceof PaystackError ? err.message : 'Could not set up the payout account',
        err instanceof PaystackError && err.indeterminate
      );
    }
  },

  async verify(reference, expectedTotalNaira) {
    try {
      const { data: ps } = await axios.get(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: paystackHeaders()
      });
      const status: string = ps.data.status;
      if (status !== 'success') {
        return { state: status === 'failed' || status === 'reversed' ? 'failed' : 'pending', status };
      }
      // The customer may carry Paystack's fee (dashboard setting): then the charge is the order
      // total plus exactly the fee Paystack reports. Any other difference is a mismatch.
      const expected = toKobo(expectedTotalNaira);
      const fees = Number(ps.data.fees) || 0;
      if (ps.data.amount !== expected && ps.data.amount !== expected + fees) {
        return { state: 'amount_mismatch', status };
      }
      return { state: 'paid', status };
    } catch (err: any) {
      throw new GatewayError(err?.response?.data?.message ?? 'Verification failed', !err?.response);
    }
  }
};
