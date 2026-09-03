'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NAVIGATION, isActive, type NavItem } from './navigation.config';
import { usePermission } from '@/admin/permissions/use-permission';
import { useIsMobile } from '@/admin/primitives/use-is-mobile';
import { useAdminSession } from '@/lib/admin-session-context';
import { ROLE_LABEL } from '@/admin/permissions/permissions';
import { adminFetch } from '@/lib/api';
import { IconDiamond, IconLogout, IconMoon, IconSun } from '@/components/icons';
import { useTheme } from './theme';

/**
 * Config-driven, permission-filtered, badge-aware.
 *
 * Responsive: fixed at >= 768px, an off-canvas drawer below that. The drawer is
 * a dialog — focus trapped, Escape closes, focus returned to the trigger.
 */
export function AdminSidebar({
  pathname,
  open,
  onClose,
  badges
}: {
  pathname: string;
  open: boolean;
  onClose: () => void;
  badges: Partial<Record<'pendingVendors' | 'pendingOrders', number>>;
}) {
  const isMobile = useIsMobile();
  const asideRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { name, role } = useAdminSession();
  const { theme, toggle } = useTheme();

  useEffect(() => {
    if (!isMobile || !open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    asideRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      triggerRef.current?.focus?.();
    };
  }, [isMobile, open, onClose]);

  async function handleLogout() {
    await adminFetch('/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  return (
    <>
      {isMobile && open && <div className="adm-scrim adm-scrim--nav" onClick={onClose} aria-hidden="true" />}

      <aside
        ref={asideRef}
        id="adm-sidebar"
        className={[
          'adm-sidebar',
          isMobile ? 'adm-sidebar--drawer' : '',
          isMobile && open ? 'is-open' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Main navigation"
        aria-hidden={isMobile && !open ? true : undefined}
      >
        <div className="adm-sidebar-brand">
          <IconDiamond className="adm-sidebar-logo" />
          <div className="adm-sidebar-brand-text">
            <span className="adm-sidebar-brand-name">4FG Admin</span>
            <span className="adm-sidebar-brand-sub">Operations console</span>
          </div>
          {isMobile && (
            <button
              type="button"
              className="adm-btn adm-btn--icon adm-sidebar-close"
              onClick={onClose}
              aria-label="Close navigation"
            >
              ✕
            </button>
          )}
        </div>

        <nav className="adm-sidebar-nav">
          {NAVIGATION.map((section, i) => (
            <NavGroup
              key={section.section ?? `s${i}`}
              title={section.section}
              items={section.items}
              pathname={pathname}
              badges={badges}
              onNavigate={isMobile ? onClose : undefined}
            />
          ))}
        </nav>

        <div className="adm-sidebar-footer">
          <div className="adm-sidebar-user">
            <span className="adm-avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="adm-sidebar-user-info">
              <span className="adm-sidebar-user-name">{name}</span>
              <span className="adm-sidebar-user-role">{ROLE_LABEL[role] ?? role}</span>
            </span>
          </div>

          <button type="button" className="adm-sidebar-btn" onClick={toggle}>
            {theme === 'dark' ? <IconSun className="adm-nav-icon" /> : <IconMoon className="adm-nav-icon" />}
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <button type="button" className="adm-sidebar-btn" onClick={handleLogout}>
            <IconLogout className="adm-nav-icon" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------------- */

function NavGroup({
  title,
  items,
  pathname,
  badges,
  onNavigate
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  badges: Partial<Record<string, number>>;
  onNavigate?: () => void;
}) {
  return (
    <div className="adm-nav-group">
      {title && <div className="adm-micro-label adm-nav-group-title">{title}</div>}
      <ul className="adm-nav-list">
        {items.map((item) => (
          <NavLink
            key={item.route}
            item={item}
            pathname={pathname}
            badges={badges}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  badges,
  onNavigate
}: {
  item: NavItem;
  pathname: string;
  badges: Partial<Record<string, number>>;
  onNavigate?: () => void;
}) {
  // Navigation entries are HIDDEN when denied — unlike a row action, an entry
  // the operator can never reach is only noise.
  const allowed = usePermission(item.permission);
  if (!allowed) return null;

  const active = isActive(item, pathname);
  const count = item.badge ? (badges[item.badge.key] ?? 0) : 0;
  const Icon = item.icon;

  return (
    <li>
      <Link
        href={item.route}
        className={`adm-nav-item${active ? ' is-active' : ''}`}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <Icon className="adm-nav-icon" />
        <span className="adm-nav-label">{item.label}</span>
        {count > 0 && (
          <span
            className={`adm-nav-badge${item.badge?.tone === 'error' ? ' adm-nav-badge--error' : ''}`}
            aria-label={`${count} pending`}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </Link>
    </li>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || '?'
  );
}
