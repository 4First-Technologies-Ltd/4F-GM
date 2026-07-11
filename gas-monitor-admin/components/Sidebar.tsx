'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  IconDiamond,
  IconGrid,
  IconStore,
  IconUserCircle,
  IconUsers,
  IconPackage,
  IconTag,
  IconSettings,
  IconLogout
} from '@/components/icons';
import { useAdminSession } from '@/lib/admin-session-context';

const SECTIONS = [
  {
    label: 'Overview',
    links: [{ href: '/dashboard', label: 'Overview', icon: IconGrid }]
  },
  {
    label: 'Directory',
    links: [
      { href: '/dashboard/vendors', label: 'Vendors', icon: IconStore },
      { href: '/dashboard/customers', label: 'Customers', icon: IconUserCircle },
      { href: '/dashboard/users', label: 'All Users', icon: IconUsers }
    ]
  },
  {
    label: 'Operations',
    links: [
      { href: '/dashboard/orders', label: 'Orders', icon: IconPackage },
      { href: '/dashboard/listings', label: 'Listings', icon: IconTag }
    ]
  }
];

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { name, role } = useAdminSession();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <IconDiamond className="sidebar-logo" />
        <div className="sidebar-brand-text">
          <h2>4FG Admin</h2>
          <span className="sidebar-brand-sub">Operations console</span>
        </div>
      </div>

      <nav aria-label="Admin">
        {SECTIONS.map((section) => (
          <div key={section.label} style={{ display: 'contents' }}>
            <span className="sidebar-section-label">{section.label}</span>
            {section.links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link key={link.href} href={link.href} className={isActive ? 'active' : ''}>
                  <Icon className="nav-icon" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
        {(role === 'SUPER_ADMIN' || role === 'OPERATIONS') && (
          <>
            <span className="sidebar-section-label">System</span>
            <Link href="/dashboard/settings" className={pathname === '/dashboard/settings' ? 'active' : ''}>
              <IconSettings className="nav-icon" />
              <span>Settings</span>
            </Link>
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-user">
          <span className="sidebar-avatar" aria-hidden="true">
            {initialsOf(name)}
          </span>
          <div className="sidebar-user-info">
            <strong>{name}</strong>
            <span>{role.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
          <button className="logout" onClick={handleLogout} aria-label="Log out" title="Log out">
            <IconLogout className="nav-icon" />
          </button>
        </div>
      </div>
    </aside>
  );
}
