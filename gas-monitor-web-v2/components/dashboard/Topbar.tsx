'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Menu, Bell } from 'lucide-react';

const TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/overview': 'Overview',
  '/dashboard/device': 'Device',
  '/dashboard/orders': 'Orders',
  '/dashboard/listings': 'Listings',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/addresses': 'Addresses',
  '/dashboard/profile': 'Profile',
  '/dashboard/documents': 'Documents',
  '/dashboard/settings': 'Settings'
};

function pageTitle(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  const match = Object.keys(TITLES).find((path) => path !== '/dashboard' && pathname.startsWith(path));
  return match ? TITLES[match] : 'Dashboard';
}

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
        {/* Menu button (mobile) */}
        <button
          type="button"
          className="md:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Page title */}
        <h1 className="text-lg font-semibold text-foreground flex-1 md:flex-none">
          {pageTitle(pathname)}
        </h1>

        {/* Actions */}
        <div className="flex items-center gap-2 md:gap-4">
          <button
            type="button"
            className="p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Notifications"
            disabled
          >
            <Bell className="h-5 w-5" />
          </button>
          {user && (
            <span className="text-xs md:text-sm font-medium text-muted-foreground px-2">
              {user.name.split(' ')[0]}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
