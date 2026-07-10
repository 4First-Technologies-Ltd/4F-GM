export const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';
export const PAYSTACK_BASE = 'https://api.paystack.co';
// Intercept-only URL — the mobile WebView blocks navigation to it and extracts the reference
export const CALLBACK_URL = 'https://4fgmonitor.app.local/payment-callback';

export function paystackHeaders() {
  return { Authorization: `Bearer ${PAYSTACK_SECRET}` };
}
