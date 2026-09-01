'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Grid3x3,
  Package,
  Settings,
  Store,
  LogOut,
  X,
  BarChart3,
  MapPin,
  Smartphone,
  User,
  FileText
} from 'lucide-react';

const CONSUMER_NAV_ITEMS = [
  { href: '/dashboard/device', label: 'Device', icon: Smartphone, exact: false },
  { href: '/dashboard/overview', label: 'Overview', icon: Grid3x3, exact: false },
  { href: '/dashboard/orders', label: 'Orders', icon: Package, exact: false },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, exact: false },
  { href: '/dashboard/addresses', label: 'Addresses', icon: MapPin, exact: false },
  { href: '/dashboard/profile', label: 'Profile', icon: User, exact: false },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, exact: false }
];

const VENDOR_NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: Grid3x3, exact: true },
  { href: '/dashboard/orders', label: 'Incoming orders', icon: Package, exact: false },
  { href: '/dashboard/listings', label: 'Listings', icon: Store, exact: false },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, exact: false },
  { href: '/dashboard/profile', label: 'Profile', icon: User, exact: false },
  { href: '/dashboard/documents', label: 'Documents', icon: FileText, exact: false },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, exact: false }
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
  const NAV_ITEMS = user?.role === 'VENDOR' ? VENDOR_NAV_ITEMS : CONSUMER_NAV_ITEMS;

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          aria-label="Close menu"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border flex flex-col z-50 transition-transform duration-300 md:relative md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold text-primary">4F</span>
            <span className="text-xs font-medium text-foreground hidden sm:block">4FG Monitor</span>
          </Link>
          <button
            type="button"
            className="md:hidden p-1.5 hover:bg-muted rounded-lg transition-colors"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Dashboard">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-all duration-200 ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                aria-current={isActive ? 'page' : undefined}
                onClick={onClose}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3 space-y-2">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
          >
            <Store className="h-5 w-5" />
            <span className="text-sm">Back to site</span>
          </Link>

          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50">
              <div
                className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary"
                aria-hidden="true"
              >
                {initials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <button
                type="button"
                className="flex-shrink-0 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors"
                aria-label="Sign out"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
