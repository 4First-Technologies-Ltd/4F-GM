'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import VendorOverview from '@/components/dashboard/VendorOverview';

export default function DashboardIndexPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isConsumer = user?.role !== 'VENDOR';

  // Consumers land on the Device page — the core 4FG experience
  useEffect(() => {
    if (isConsumer) router.replace('/dashboard/device');
  }, [isConsumer, router]);

  if (isConsumer) return null;
  return <VendorOverview />;
}
