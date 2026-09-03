'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminSessionProvider, type AdminSession } from '@/lib/admin-session-context';
import { ThemeProvider } from '@/admin/core/theme';
import { AdminSidebar } from '@/admin/core/sidebar';
import { AdminHeader } from '@/admin/core/header';
import { titleFor } from '@/admin/core/navigation.config';
import { adminFetch } from '@/lib/api';
import { getJson } from '@/admin/data/source';

/**
 * The shell. Owns the mobile drawer state and the ONE badge-count query that
 * feeds the sidebar — not one query per nav item.
 *
 * Auth is the project's existing session check against /auth/me. This is a UX
 * guard; the security boundary is `requireAdmin` on every backend route.
 */

interface Counts {
  pendingVendors: number;
  pendingOrders: number;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [session, setSession] = useState<AdminSession | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [badges, setBadges] = useState<Partial<Counts>>({});

  useEffect(() => {
    let cancelled = false;
    adminFetch('/auth/me')
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

  // Close the drawer on navigation — otherwise it covers the page just reached.
  useEffect(() => setDrawerOpen(false), [pathname]);

  const loadBadges = useCallback(() => {
    // `limit=1` keeps this cheap: only pagination.total is used.
    Promise.allSettled([
      getJson<{ pagination: { total: number } }>('/vendors?status=PENDING&limit=1'),
      getJson<{ pagination: { total: number } }>('/orders?status=PENDING&limit=1')
    ]).then(([v, o]) => {
      setBadges({
        pendingVendors: v.status === 'fulfilled' ? v.value.pagination.total : 0,
        pendingOrders: o.status === 'fulfilled' ? o.value.pagination.total : 0
      });
    });
    // A failed badge count must never break the shell — hence allSettled and
    // a zero fallback rather than an error state.
  }, []);

  useEffect(() => {
    if (session) loadBadges();
  }, [session, pathname, loadBadges]);

  if (!session) {
    return (
      <main className="adm-boot" role="status" aria-live="polite">
        Loading…
      </main>
    );
  }

  return (
    <AdminSessionProvider session={session}>
      <ThemeProvider>
        <div className="adm-shell">
          <a className="adm-skip-link" href="#adm-main">
            Skip to content
          </a>

          <AdminSidebar
            pathname={pathname}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            badges={badges}
          />

          <div className="adm-shell-body">
            <AdminHeader
              title={titleFor(pathname)}
              pathname={pathname}
              onMenuClick={() => setDrawerOpen((o) => !o)}
              drawerOpen={drawerOpen}
            />
            <main id="adm-main" className="adm-main">
              {children}
            </main>
          </div>
        </div>
      </ThemeProvider>
    </AdminSessionProvider>
  );
}
