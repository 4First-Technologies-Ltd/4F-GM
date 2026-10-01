import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus'>): string {
  if (user.role === 'VENDOR' && user.vendorStatus !== 'APPROVED') return '/vendor-pending';
  if (user.role === 'RIDER' && user.riderStatus !== 'APPROVED') return '/rider-pending';
  return '/dashboard';
}
