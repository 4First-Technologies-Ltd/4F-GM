'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { AdminSessionProvider, AdminSession } from '@/lib/admin-session-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setSession({ name: data.name, role: data.role });
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/login');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!session) {
    return <main className="loading-state">Loading…</main>;
  }

  return (
    <AdminSessionProvider session={session}>
      <div className="dashboard-shell">
        <Sidebar />
        <div className="dashboard-main">
          <header className="admin-topbar">
            <div className="topbar-breadcrumb">
              <strong>4FG Platform</strong> / Admin Console
            </div>
            <div className="topbar-right">
              <span className="admin-role-badge">{session.role.replace(/_/g, ' ')}</span>
              <span className="topbar-avatar" aria-hidden="true">
                {session.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join('')}
              </span>
              <span className="topbar-name">{session.name}</span>
            </div>
          </header>
          <div className="dashboard-content">{children}</div>
        </div>
      </div>
    </AdminSessionProvider>
  );
}
