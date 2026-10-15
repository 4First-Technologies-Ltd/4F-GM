'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ManagerStock } from '@/components/manager/ManagerStock';

/** Branch managers only: their branch's stock. Vendors manage stock from Listings. */
export default function StockPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isManager = user?.role === 'BRANCH_MANAGER';

  useEffect(() => {
    if (!loading && user && !isManager) router.replace('/dashboard');
  }, [loading, user, isManager, router]);

  if (!isManager) return null;
  return <ManagerStock />;
}
