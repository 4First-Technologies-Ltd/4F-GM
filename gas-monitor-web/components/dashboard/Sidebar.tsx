'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { IconGrid, IconPackage, IconSettings, IconStore, IconSignOut, IconClose } from '@/components/icons';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: IconGrid, exact: true },
  { href: '/dashboard/orders', label: 'Orders', icon: IconPackage, exact: false },
  { href: '/dashboard/settings', label: 'Settings', icon: IconSettings, exact: false }
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <>
      {open && <button type="button" className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
      <aside className={`dashboard-sidebar${open ? ' is-open' : ''}`}>
        <div className="sidebar-head">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close menu">
            <IconClose />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={onClose}
              >
                <Icon className="sidebar-link-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <a href="/" className="sidebar-link sidebar-link-muted">
            <IconStore className="sidebar-link-icon" />
            <span>Back to site</span>
          </a>

          {user && (
            <div className="sidebar-user">
              <span className="sidebar-avatar" aria-hidden="true">
                {initials(user.name)}
              </span>
              <div className="sidebar-user-info">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </div>
              <button
                type="button"
                className="sidebar-signout"
                aria-label="Sign out"
                onClick={async () => {
                  await logout();
                  router.push('/');
                }}
              >
                <IconSignOut />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
