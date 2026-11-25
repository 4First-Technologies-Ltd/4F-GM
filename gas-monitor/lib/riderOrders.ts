import { Linking } from 'react-native';
import type { OrderStatus, RiderOrder } from './api';

export const fmtNaira = (n: number) => '₦' + n.toLocaleString();

export const RIDER_STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Awaiting payment', color: '#B45309', bg: '#FEF3E2' },
  CONFIRMED: { label: 'Needs accepting', color: '#B45309', bg: '#FEF3E2' },
  ACCEPTED: { label: 'Ready for pickup', color: '#1D4ED8', bg: '#E8F0FE' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', color: '#E65100', bg: '#FFF3E0' },
  DELIVERED: { label: 'Delivered', color: '#2D7450', bg: '#E8F5E8' },
  CANCELLED: { label: 'Cancelled', color: '#D32F2F', bg: '#FFEBEE' },
};

/** Orders that still need rider action. Everything else belongs in history. */
export const isActiveOrder = (o: RiderOrder) => o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY';
export const isHistoryOrder = (o: RiderOrder) => o.status === 'DELIVERED' || o.status === 'CANCELLED';

/** The one forward step a rider can take from the current status, if any. */
export function nextRiderAction(status: OrderStatus) {
  if (status === 'ACCEPTED') {
    return {
      to: 'OUT_FOR_DELIVERY' as const,
      label: 'Picked up, start delivery',
      confirmTitle: 'Have you collected the gas?',
      confirmBody: 'This tells the customer their order is on the way.',
    };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return {
      to: 'DELIVERED' as const,
      label: 'Complete delivery',
      confirmTitle: 'Complete this delivery',
      confirmBody: "Ask the customer for their 4-digit delivery PIN once they have the cylinder(s), and enter it.",
    };
  }
  return null;
}

export function callNumber(phone?: string | null) {
  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
}

export function openInMaps(address: string) {
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`).catch(() => {});
}

export const orderRef = (o: RiderOrder) => '#' + o.id.slice(0, 8).toUpperCase();

export const supplierLabel = (o: RiderOrder) => o.vendor?.businessName ?? o.supplierName ?? 'Supplier';

/** Where the rider collects the order. */
export const pickupAddress = (o: RiderOrder) => o.branch?.address ?? o.vendor?.businessAddress ?? null;
