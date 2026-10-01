import type { OrderStatus, RiderOrder } from './api';

export const PENDING_RIDER_KEY = '4fg_pending_rider_profile';

export const VEHICLE_TYPES = ['Motorbike', 'Bicycle', 'Tricycle', 'Car / Van'] as const;

export const RIDER_STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100/50 text-amber-700',
  CONFIRMED: 'bg-blue-100/50 text-blue-700',
  OUT_FOR_DELIVERY: 'bg-orange-100/50 text-orange-700',
  DELIVERED: 'bg-green-100/50 text-green-700',
  CANCELLED: 'bg-red-100/50 text-red-700'
};

/** Rider-facing wording for the pre-delivery states (the shared labels are consumer-facing). */
export const RIDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

/** Orders that still need rider action. Everything else belongs in history. */
export const isActiveOrder = (o: RiderOrder) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY';
export const isHistoryOrder = (o: RiderOrder) => o.status === 'DELIVERED' || o.status === 'CANCELLED';

/** The one forward step a rider can take from the current status, if any. */
export function nextRiderAction(status: OrderStatus) {
  if (status === 'CONFIRMED') {
    return {
      to: 'OUT_FOR_DELIVERY' as const,
      label: 'Start delivery',
      confirmTitle: 'Start this delivery?',
      confirmBody: 'This tells the customer their order is on the way.'
    };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return {
      to: 'DELIVERED' as const,
      label: 'Mark as delivered',
      confirmTitle: 'Mark as delivered?',
      confirmBody: 'Only confirm once the customer has received the cylinder(s).'
    };
  }
  return null;
}

export const orderRef = (o: RiderOrder) => '#' + o.id.slice(0, 8).toUpperCase();

export const supplierLabel = (o: RiderOrder) => o.vendor?.businessName ?? o.supplierName ?? 'Supplier';

export const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/** Stashed by the sign-up form until email verification issues a session. */
export interface PendingRiderProfile {
  phone: string;
  vehicleType: string;
  plateNumber?: string;
}

export function readPendingRider(): PendingRiderProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_RIDER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRiderProfile>;
    if (!parsed.phone || !parsed.vehicleType) return null;
    return parsed as PendingRiderProfile;
  } catch {
    return null;
  }
}
