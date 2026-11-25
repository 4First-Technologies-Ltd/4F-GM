import type { OrderStatus } from './api';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Paid',
  ACCEPTED: 'Accepted',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

/** What the customer is waiting for, in their words. */
export function customerStatusLabel(o: { status: OrderStatus; riderId?: string | null }): string {
  if (o.status === 'CONFIRMED') return 'Waiting for the vendor';
  if (o.status === 'ACCEPTED') return o.riderId ? 'Rider on the way to collect' : 'Finding a rider';
  return STATUS_LABEL[o.status];
}

/** Paid orders that are not finished yet. */
export const isOpenOrder = (o: { status: OrderStatus }) =>
  o.status === 'CONFIRMED' || o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY';

/** Every paid order, finished or not (revenue and spend totals). */
export const isPaidOrder = (o: { status: OrderStatus }) => isOpenOrder(o) || o.status === 'DELIVERED';

export function formatNaira(amount: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(amount);
}
