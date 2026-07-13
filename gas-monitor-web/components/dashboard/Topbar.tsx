'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { IconMenu, IconBell } from '@/components/icons';

const TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/overview': 'Overview',
  '/dashboard/device': 'Device',
  '/dashboard/orders': 'Orders',
  '/dashboard/listings': 'Listings',
  '/dashboard/analytics': 'Analytics',
  '/dashboard/addresses': 'Addresses',
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
    <header className="dashboard-topbar">
      <button type="button" className="topbar-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <IconMenu />
      </button>
      <h1 className="topbar-title">{pageTitle(pathname)}</h1>
      <div className="topbar-actions">
        <button type="button" className="topbar-icon-btn" aria-label="Notifications (none yet)" disabled>
          <IconBell />
        </button>
        {user && (
          <span className="topbar-user" aria-hidden="true">
            {user.name.split(' ')[0]}
          </span>
        )}
      </div>
    </header>
  );
}
