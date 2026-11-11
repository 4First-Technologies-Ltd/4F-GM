'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NAVIGATION, isActive, type NavItem } from './navigation.config';
import { usePermission } from '@/admin/permissions/use-permission';
import { can } from '@/admin/permissions/can';
import { useIsMobile } from '@/admin/primitives/use-is-mobile';
import { useAdminSession } from '@/lib/admin-session-context';
import { ROLE_LABEL } from '@/admin/permissions/permissions';
import { adminFetch } from '@/lib/api';
import {
  IconChevronDown,
  IconChevronsLeft,
  IconChevronsRight,
  IconLogout,
  IconMoon,
  IconSun
} from '@/components/icons';
import { BrandMark } from '@/components/BrandMark';
import { useTheme } from './theme';

const OPEN_KEY = 'adm-nav-open';
const RAIL_KEY = 'adm-nav-rail';

/** Browser storage can throw (private window, blocked site data): never rely on it. */
function readOpen(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

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
  badges: Partial<Record<string, number>>;
}) {
  const isMobile = useIsMobile();
  const asideRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { name, role } = useAdminSession();
  const { theme, toggle } = useTheme();

  // The shell only mounts this after the session loads on the client, so
  // reading storage in the initialiser cannot cause a hydration mismatch.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(readOpen);
  const [railPref, setRailPref] = useState<boolean>(readRail);
  // The drawer on mobile always shows full labels; icon-only is a desktop mode.
  const rail = railPref && !isMobile;

  // Landing on a page opens its section, so the current page is never hidden.
  // Depends on the path only: the operator can still collapse it afterwards.
  useEffect(() => {
    const current = NAVIGATION.find((s) => s.section && s.items.some((i) => isActive(i, pathname)))?.section;
    if (current) setOpenMap((m) => (m[current] ? m : { ...m, [current]: true }));
  }, [pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, JSON.stringify(openMap));
    } catch {
      /* ignore */
    }
  }, [openMap]);

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, railPref ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [railPref]);

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
          rail ? 'adm-sidebar--rail' : '',
          isMobile && open ? 'is-open' : ''
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label="Main navigation"
        aria-hidden={isMobile && !open ? true : undefined}
      >
        <div className="adm-sidebar-brand">
          <BrandMark className="adm-sidebar-logo" />
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
              rail={rail}
              open={!!(section.section && openMap[section.section])}
              onToggle={() =>
                section.section &&
                setOpenMap((m) => ({ ...m, [section.section as string]: !m[section.section as string] }))
              }
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

          <button
            type="button"
            className="adm-sidebar-btn"
            onClick={toggle}
            title={rail ? (theme === 'dark' ? 'Light mode' : 'Dark mode') : undefined}
            aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <IconSun className="adm-nav-icon" /> : <IconMoon className="adm-nav-icon" />}
            <span className="adm-sidebar-btn-label">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>

          <button
            type="button"
            className="adm-sidebar-btn"
            onClick={handleLogout}
            title={rail ? 'Sign out' : undefined}
            aria-label="Sign out"
          >
            <IconLogout className="adm-nav-icon" />
            <span className="adm-sidebar-btn-label">Sign out</span>
          </button>

          {!isMobile && (
            <button
              type="button"
              className="adm-sidebar-btn"
              onClick={() => setRailPref((v) => !v)}
              aria-pressed={railPref}
              aria-label={railPref ? 'Expand sidebar' : 'Collapse sidebar to icons'}
              title={railPref ? 'Expand sidebar' : undefined}
            >
              {railPref ? (
                <IconChevronsRight className="adm-nav-icon" />
              ) : (
                <IconChevronsLeft className="adm-nav-icon" />
              )}
              <span className="adm-sidebar-btn-label">Collapse sidebar</span>
            </button>
          )}
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
  rail,
  open,
  onToggle,
  onNavigate
}: {
  title?: string;
  items: NavItem[];
  pathname: string;
  badges: Partial<Record<string, number>>;
  rail: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
}) {
  // A section whose every entry is denied would be a bare heading.
  const session = useAdminSession();
  const visible = items.filter((i) => can(session.role, i.permission, session.smosRole));
  if (visible.length === 0) return null;

  // Untitled sections (Overview) have nothing to collapse, and the icon-only
  // rail shows every icon so nothing is hidden behind a closed section.
  const collapsible = !!title && !rail;
  const expanded = !collapsible || open;
  const listId = `adm-nav-${(title ?? 'top').toLowerCase().replace(/\W+/g, '-')}`;

  // A closed section still has to flag work waiting inside it.
  const hiddenCount = expanded
    ? 0
    : visible.reduce((n, i) => n + (i.badge ? (badges[i.badge.key] ?? 0) : 0), 0);
  const hiddenHasError = !expanded && visible.some((i) => i.badge?.tone === 'error' && (badges[i.badge.key] ?? 0) > 0);

  return (
    <div className="adm-nav-group">
      {title && collapsible && (
        <button
          type="button"
          className="adm-nav-group-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
        >
          <span className="adm-micro-label">{title}</span>
          {hiddenCount > 0 && (
            <span
              className={`adm-nav-badge${hiddenHasError ? ' adm-nav-badge--error' : ''}`}
              aria-label={`${hiddenCount} pending in ${title}`}
            >
              {hiddenCount > 99 ? '99+' : hiddenCount}
            </span>
          )}
          <IconChevronDown className={`adm-nav-chevron${open ? ' is-open' : ''}`} />
        </button>
      )}
      {expanded && (
        <ul className="adm-nav-list" id={listId}>
          {items.map((item) => (
            <NavLink
              key={item.route}
              item={item}
              pathname={pathname}
              badges={badges}
              rail={rail}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NavLink({
  item,
  pathname,
  badges,
  rail,
  onNavigate
}: {
  item: NavItem;
  pathname: string;
  badges: Partial<Record<string, number>>;
  rail: boolean;
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
        aria-label={rail ? item.label : undefined}
        title={rail ? item.label : undefined}
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
