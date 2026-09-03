import type { ReactNode } from 'react';

/**
 * Loading, empty, error, forbidden.
 *
 * Every list, panel, and chart uses these. A page that renders `null` while
 * loading is unfinished — that was the single most common defect in the previous
 * implementation.
 */

/* --------------------------------------------------------------- loading --- */

/** Skeleton matching the real column layout, so nothing shifts when data lands. */
export function LoadingState({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  const width = (i: number) => (i === 0 ? '22%' : i === columns - 1 ? '10%' : '14%');
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="adm-sr-only">Loading…</span>
      <div className="adm-skeleton-row adm-skeleton-row--head" aria-hidden="true">
        {Array.from({ length: columns }).map((_, i) => (
          <span key={i} className="adm-skeleton-cell" style={{ width: width(i) }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="adm-skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((_, i) => (
            <span key={i} className="adm-skeleton-cell" style={{ width: width(i) }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** For a panel or card, where a table skeleton would be wrong. */
export function LoadingBlock({ height = 120 }: { height?: number }) {
  return (
    <div className="adm-skeleton-block" style={{ height }} role="status" aria-busy="true">
      <span className="adm-sr-only">Loading…</span>
    </div>
  );
}

/* ----------------------------------------------------------------- empty --- */

export function EmptyState({
  title,
  description,
  action,
  tone = 'empty'
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: 'empty' | 'forbidden';
}) {
  return (
    <div className={`adm-state adm-state--${tone}`}>
      <h2 className="adm-state-title">{title}</h2>
      {description && <p className="adm-state-desc">{description}</p>}
      {action && <div className="adm-state-action">{action}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- error --- */

/**
 * Shows the server's own message. Never replaces a real error with
 * "Something went wrong" — the operator is usually reporting it to an engineer.
 */
export function ErrorState({
  title = 'Could not load this',
  error,
  onRetry
}: {
  title?: string;
  error?: Error | null;
  onRetry?: () => void;
}) {
  return (
    <div className="adm-state adm-state--error" role="alert">
      <h2 className="adm-state-title">{title}</h2>
      {error?.message && <p className="adm-state-desc">{error.message}</p>}
      {onRetry && (
        <div className="adm-state-action">
          <button type="button" className="adm-btn adm-btn--primary" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export function ForbiddenState({ permission }: { permission: string }) {
  return (
    <EmptyState
      tone="forbidden"
      title="You do not have access to this"
      description={`This view requires the ${permission} permission. Ask a super admin if you need it.`}
    />
  );
}

/** Non-blocking failure of one panel — the rest of the page still renders. */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="adm-inline-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="adm-btn adm-btn--sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
