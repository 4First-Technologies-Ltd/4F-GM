import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus' | 'companyStatus'>): string {
  if (user.role === 'VENDOR' && user.vendorStatus !== 'APPROVED') return '/vendor-pending';
  if (user.role === 'RIDER' && user.riderStatus !== 'APPROVED') return '/rider-pending';
  if (user.role === 'LOGISTICS_COMPANY' && user.companyStatus !== 'APPROVED') return '/company-pending';
  return '/dashboard';
}
