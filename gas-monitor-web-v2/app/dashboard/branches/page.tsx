'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BranchManager } from '@/components/vendor/BranchManager';

/** Vendors only: manage the locations they sell from. */
export default function BranchesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isVendor = user?.role === 'VENDOR';

  useEffect(() => {
    if (!loading && user && !isVendor) router.replace('/dashboard');
  }, [loading, user, isVendor, router]);

  if (!isVendor) return null;
  return <BranchManager />;
}
