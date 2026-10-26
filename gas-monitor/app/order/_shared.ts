import type { ConsumerOrder, OrderStatus } from '@/lib/api';

export const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string; border: string }> = {
  PENDING:          { label: 'Awaiting payment', color: '#B45309', bg: '#FEF3E2', border: '#B4530940' },
  CONFIRMED:        { label: 'Confirmed',        color: '#1D4ED8', bg: '#E8F0FE', border: '#1D4ED840' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: '#E65100', bg: '#FFF3E0', border: '#E6510040' },
  DELIVERED:        { label: 'Delivered',        color: '#2D7450', bg: '#E8F5E8', border: '#2D745040' },
  CANCELLED:        { label: 'Cancelled',        color: '#D32F2F', bg: '#FFEBEE', border: '#D32F2F40' },
};

export const STATUS_CONTENT: Record<OrderStatus, { icon: string; headline: string; sub: string }> = {
  PENDING: {
    icon: 'hourglass',
    headline: 'Awaiting Payment',
    sub: 'We have not received payment for this order yet.',
  },
  CONFIRMED: {
    icon: 'checkmark.circle.fill',
    headline: 'Order Confirmed',
    sub: 'Payment received. Your supplier is preparing the order.',
  },
  OUT_FOR_DELIVERY: {
    icon: 'shippingbox.fill',
    headline: 'Out for Delivery',
    sub: 'Your gas is on its way.',
  },
  DELIVERED: {
    icon: 'checkmark.circle.fill',
    headline: 'Order Delivered',
    sub: 'Your gas has been successfully delivered.',
  },
  CANCELLED: {
    icon: 'xmark.circle.fill',
    headline: 'Order Cancelled',
    sub: 'This order was cancelled before delivery.',
  },
};

/** Forward steps shown on the timeline, in the order an order moves through them. */
export const TIMELINE_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Order placed' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function fmtPrice(n: number) {
  return '₦' + Math.round(n).toLocaleString();
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' });
}

/** Who the order was bought from: the vendor's business, else the name saved on the order. */
export function supplierOf(order: ConsumerOrder) {
  return order.vendor?.businessName ?? order.supplierName ?? '4FG Monitor';
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '4F';
}

/** Short, human-friendly reference — the id is a long uuid. */
export function shortRef(order: ConsumerOrder) {
  return '#' + order.id.replace(/-/g, '').slice(0, 8).toUpperCase();
}
