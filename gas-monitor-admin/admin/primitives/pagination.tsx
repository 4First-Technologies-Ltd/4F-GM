'use client';

/**
 * Showing 1–20 of 348      Per page [10][20][50][100]      ‹ 1 … 4 5 6 … 18 ›
 *
 * Hidden entirely when there is one page and no page-size choice worth making.
 */

const SIZES = [10, 20, 50, 100] as const;

export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  if (totalPages <= 1 && total <= SIZES[0]) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="adm-pagination" aria-label="Pagination">
      <span className="adm-pagination-summary" aria-live="polite">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>

      <div className="adm-pagination-controls">
        <div className="adm-pagination-size">
          <span className="adm-pagination-size-label">Per page</span>
          {SIZES.map((size) => (
            <button
              key={size}
              type="button"
              className="adm-page-btn"
              aria-pressed={pageSize === size}
              aria-label={`${size} per page`}
              onClick={() => onPageSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="adm-pagination-pages">
            <button
              type="button"
              className="adm-page-btn"
              disabled={page === 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>

            {pageWindow(page, totalPages).map((p, i) =>
              p === '…' ? (
                <span key={`gap-${i}`} className="adm-page-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className="adm-page-btn"
                  aria-current={page === p ? 'page' : undefined}
                  aria-label={`Page ${p}`}
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </button>
              )
            )}

            <button
              type="button"
              className="adm-page-btn"
              disabled={page === totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

/** First and last stay reachable; the gap collapses to an ellipsis. */
function pageWindow(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, '…', totalPages];
  if (page >= totalPages - 3)
    return [1, '…', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [1, '…', page - 1, page, page + 1, '…', totalPages];
}
