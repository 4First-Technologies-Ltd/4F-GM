'use client';

import { breadcrumbsFor } from './navigation.config';
import { useIsMobile } from '@/admin/primitives/use-is-mobile';
import { useAdminSession } from '@/lib/admin-session-context';
import { ROLE_LABEL } from '@/admin/permissions/permissions';
import { IconMenu } from '@/components/icons';

/**
 * Desktop: title + breadcrumbs left, user chip right.
 * Mobile: hamburger + truncated title left, avatar right.
 *
 * There is deliberately no notification bell: the project has no notification
 * source, and a bell with a fabricated count is a lie the operator learns to
 * distrust. Pending counts live on the sidebar nav items instead, where they
 * are backed by a real query.
 */
export function AdminHeader({
  title,
  pathname,
  onMenuClick,
  drawerOpen
}: {
  title: string;
  pathname: string;
  onMenuClick: () => void;
  drawerOpen: boolean;
}) {
  const isMobile = useIsMobile();
  const { name, role } = useAdminSession();
  const trail = breadcrumbsFor(pathname);

  return (
    <header className="adm-header">
      <div className="adm-header-left">
        {isMobile && (
          <button
            type="button"
            className="adm-btn adm-btn--icon"
            onClick={onMenuClick}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="adm-sidebar"
          >
            <IconMenu className="adm-nav-icon" />
          </button>
        )}
        <div className="adm-header-titles">
          <h1 className="adm-header-title">{title}</h1>
          {!isMobile && trail.length > 1 && (
            <nav aria-label="Breadcrumb" className="adm-breadcrumbs">
              <ol>
                {trail.map((c, i) => (
                  <li key={`${c.route}-${i}`}>
                    {i < trail.length - 1 ? <span>{c.label}</span> : <span aria-current="page">{c.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </div>
      </div>

      <div className="adm-header-right">
        <div className="adm-user-chip">
          <span className="adm-avatar" aria-hidden="true">
            {name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join('') || '?'}
          </span>
          {!isMobile && (
            <span className="adm-user-chip-text">
              <span className="adm-user-name">{name}</span>
              <span className="adm-micro-label">{ROLE_LABEL[role] ?? role}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
