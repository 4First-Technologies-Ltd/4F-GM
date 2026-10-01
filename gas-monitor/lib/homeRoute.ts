import type { ApiUser } from './api';

/** Where a signed-in user belongs, based on role and approval status. */
export function homeRouteFor(user: Pick<ApiUser, 'role' | 'vendorStatus' | 'riderStatus'> | null) {
  if (user?.role === 'VENDOR') {
    return user.vendorStatus === 'APPROVED' ? '/(vendor)' : '/vendor-pending';
  }
  if (user?.role === 'RIDER') {
    return user.riderStatus === 'APPROVED' ? '/(rider)' : '/rider-pending';
  }
  return '/(tabs)';
}
