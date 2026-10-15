import type { FleetDelivery, OrderStatus } from './api';

export const PENDING_COMPANY_KEY = '4fg_pending_company_profile';

/** Stashed by the sign-up form until email verification issues a session. */
export interface PendingCompanyProfile {
  companyName: string;
  address: string;
  phone: string;
  state?: string;
  city?: string;
}

export function readPendingCompany(): PendingCompanyProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_COMPANY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingCompanyProfile>;
    if (!parsed.companyName || !parsed.address || !parsed.phone) return null;
    return parsed as PendingCompanyProfile;
  } catch {
    return null;
  }
}

/** Fleet-facing wording for an order's status. */
export const FLEET_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Assigned',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
};

export const FLEET_STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: 'bg-amber-100/50 text-amber-700',
  CONFIRMED: 'bg-blue-100/50 text-blue-700',
  OUT_FOR_DELIVERY: 'bg-orange-100/50 text-orange-700',
  DELIVERED: 'bg-green-100/50 text-green-700',
  CANCELLED: 'bg-red-100/50 text-red-700'
};

export const isActiveDelivery = (d: FleetDelivery) => d.status === 'CONFIRMED' || d.status === 'OUT_FOR_DELIVERY';
export const isFinishedDelivery = (d: FleetDelivery) => d.status === 'DELIVERED' || d.status === 'CANCELLED';

export const deliveryRef = (d: FleetDelivery) => '#' + d.id.slice(0, 8).toUpperCase();
