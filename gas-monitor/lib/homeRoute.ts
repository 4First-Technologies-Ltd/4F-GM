import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus' | 'companyStatus'> | null) {
  if (user?.role === 'VENDOR') {
    // PENDING vendors get the full dashboard (with a banner); only a rejected one is held back.
    return user.vendorStatus === 'APPROVED' || user.vendorStatus === 'PENDING' ? '/(vendor)' : '/vendor-pending';
  }
  if (user?.role === 'RIDER') {
    // No profile yet (interrupted sign-up) or rejected still lands on /rider-pending.
    return user.riderStatus === 'APPROVED' || user.riderStatus === 'PENDING' ? '/(rider)' : '/rider-pending';
  }
  if (user?.role === 'BRANCH_MANAGER') return '/(manager)';
  if (user?.role === 'LOGISTICS_COMPANY') {
    return user.companyStatus === 'APPROVED' || user.companyStatus === 'PENDING' ? '/(company)' : '/company-pending';
  }
  return '/(tabs)';
}
