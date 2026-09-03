import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 *   MICRO-LABEL                    [icon]
 *   VALUE
 *   caption
 *
 * No delta is rendered unless the backend actually supplies a comparison
 * window — the previous implementation showed movement it could not compute.
 * A stat that can be acted on links to the pre-filtered list, which is where
 * most of a metric's value actually is.
 */
export function StatCard({
  label,
  value,
  valueTitle,
  caption,
  icon,
  href,
  actionable = false,
  loading = false
}: {
  label: string;
  value: string;
  valueTitle?: string;
  caption?: string;
  icon?: ReactNode;
  href?: string;
  actionable?: boolean;
  loading?: boolean;
}) {
  const className = `adm-stat${actionable ? ' adm-stat--actionable' : ''}${href ? ' adm-stat--link' : ''}`;

  const body = (
    <>
      <div className="adm-stat-head">
        <span className="adm-micro-label">{label}</span>
        {icon && <span className="adm-stat-icon">{icon}</span>}
      </div>
      <div className="adm-stat-value" title={valueTitle}>
        {loading ? <span className="adm-skeleton-cell" style={{ width: '60%', height: 22 }} /> : value}
      </div>
      {caption && <div className="adm-stat-foot">{caption}</div>}
    </>
  );

  return href ? (
    <Link className={className} href={href}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function StatGrid({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return <div className={`adm-stat-grid${columns === 3 ? ' adm-stat-grid--3' : ''}`}>{children}</div>;
}
