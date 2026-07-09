import type { Order } from './api';

export const CYLINDER_SIZES = ['6kg', '12.5kg', '50kg'];

export const STATUS_LABEL: Record<Order['status'], string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

export function formatNaira(amount: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
}
