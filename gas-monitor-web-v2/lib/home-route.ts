import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus' | 'companyStatus'>): string {
  // PENDING accounts get the full dashboard (with a banner); only a rejected one, or one
  // whose profile was never created, is held on the status page.
  const open = (s?: string) => s === 'APPROVED' || s === 'PENDING';
  if (user.role === 'VENDOR' && !open(user.vendorStatus)) return '/vendor-pending';
  if (user.role === 'RIDER' && !open(user.riderStatus)) return '/rider-pending';
  if (user.role === 'LOGISTICS_COMPANY' && !open(user.companyStatus)) return '/company-pending';
  return '/dashboard';
}
