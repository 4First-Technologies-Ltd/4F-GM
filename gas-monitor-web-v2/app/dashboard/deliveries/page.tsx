'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { CompanyDeliveries } from '@/components/company/CompanyDeliveries';

/**
 * The fleet's deliveries (logistics companies only). A rider's own delivery
 * pages live under /dashboard/deliveries/[id].
 */
export default function FleetDeliveriesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isCompany = user?.role === 'LOGISTICS_COMPANY';

  useEffect(() => {
    if (!loading && user && !isCompany) router.replace('/dashboard');
  }, [loading, user, isCompany, router]);

  if (!isCompany) return null;
  return <CompanyDeliveries />;
}
