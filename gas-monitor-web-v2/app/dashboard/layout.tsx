'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/dashboard/Sidebar';
import Topbar from '@/components/dashboard/Topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/sign-in');
      return;
    }
    if (user?.role === 'VENDOR' && user.vendorStatus !== 'APPROVED') {
      router.replace('/vendor-pending');
    }
  }, [loading, user, router]);

  if (loading || !user || (user.role === 'VENDOR' && user.vendorStatus !== 'APPROVED')) {
    return (
      <main className="flex items-center justify-center min-h-dvh bg-background">
        <div className="text-center">
          <div className="inline-block mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-muted-foreground">Loading your dashboard…</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto">
          <div className="px-4 py-6 md:px-6 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
