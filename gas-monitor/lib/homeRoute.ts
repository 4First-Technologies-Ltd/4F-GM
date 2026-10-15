import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus' | 'companyStatus'> | null) {
  if (user?.role === 'VENDOR') {
    return user.vendorStatus === 'APPROVED' ? '/(vendor)' : '/vendor-pending';
  }
  if (user?.role === 'RIDER') {
    return user.riderStatus === 'APPROVED' ? '/(rider)' : '/rider-pending';
  }
  if (user?.role === 'BRANCH_MANAGER') return '/(manager)';
  if (user?.role === 'LOGISTICS_COMPANY') {
    return user.companyStatus === 'APPROVED' ? '/(company)' : '/company-pending';
  }
  return '/(tabs)';
}
