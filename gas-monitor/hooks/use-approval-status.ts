import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { authApi, type ApiUser } from '@/lib/api';
import { getSavedUser } from '@/lib/storage';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** The status that gates visibility for this user's role, or null for roles with no approval step. */
function statusOf(user: ApiUser | null): ApprovalStatus | null {
  if (!user) return null;
  if (user.role === 'VENDOR') return user.vendorStatus ?? null;
  if (user.role === 'RIDER') return user.riderStatus ?? null;
  if (user.role === 'LOGISTICS_COMPANY') return user.companyStatus ?? null;
  return null;
}

/** True while the signed-in vendor has no RC number on file (needed before admins can approve them). */
export function useVendorRcMissing() {
  const [missing, setMissing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getSavedUser<ApiUser>().then((u) => live && setMissing(!!u?.vendorRcNumberMissing));
      authApi
        .refreshUser()
        .then((u) => live && setMissing(!!u?.vendorRcNumberMissing))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [])
  );

  return missing;
}

/**
 * The signed-in user's approval status. Reads the saved user straight away,
 * then re-fetches on focus so an approval made in the admin panel shows up
 * (and the banner goes away) without signing out.
 */
export function useApprovalStatus() {
  const [status, setStatus] = useState<ApprovalStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getSavedUser<ApiUser>().then((u) => live && setStatus(statusOf(u)));
      authApi
        .refreshUser()
        .then((u) => live && setStatus(statusOf(u)))
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [])
  );

  return status;
}
