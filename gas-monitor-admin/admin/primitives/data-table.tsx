'use client';

import type { ReactNode } from 'react';
import type { ActionDef, ColumnDef } from '@/admin/resource/types';
import { StatusBadge } from './status-badge';
import { formatCell } from './format';
import { usePermission } from '@/admin/permissions/use-permission';
import { useIsMobile } from './use-is-mobile';

/**
 * The ONE table. Configured by ColumnDef, never subclassed per entity.
 *
 * Accessibility contract:
 *   <th scope="col">, sortable headers are buttons with aria-sort on the th,
 *   the identifying cell is <th scope="row">, the scroll container is
 *   focusable and labelled, and icon-only actions name the record they act on.
 *
 * Mobile strategy is cards: below 768px each row becomes a card carrying the
 * priority-1 columns. A table crushed to 375px is unusable.
 */

interface DataTableProps<T> {
  caption: string;
  columns: ColumnDef<T>[];
  rows: T[];
  idOf: (row: T) => string;
  sort?: { field: string; direction: 'asc' | 'desc' };
  onSort?: (field: string) => void;
  rowActions?: ActionDef<T>[];
  onAction?: (action: ActionDef<T>, row: T) => void;
  onRowClick?: (row: T) => void;
  rowNoun?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  idOf,
  sort,
  onSort,
  rowActions = [],
  onAction,
  onRowClick,
  rowNoun = 'record'
}: DataTableProps<T>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <ul className="adm-card-list" aria-label={caption}>
        {rows.map((row) => (
          <MobileCard
            key={idOf(row)}
            row={row}
            columns={columns}
            actions={rowActions}
            onAction={onAction}
            onOpen={onRowClick}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="adm-table-scroll" tabIndex={0} role="region" aria-label={`${caption} (scrollable)`}>
      <table className="adm-table">
        <caption className="adm-sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => {
              const key = col.sortField ?? col.key;
              const isSorted = sort?.field === key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`adm-th adm-th--${col.align ?? defaultAlign(col)}`}
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {col.sortable && onSort ? (
                    <button type="button" className="adm-th-sort" onClick={() => onSort(key)}>
                      {col.header}
                      <span aria-hidden="true" className="adm-th-sort-icon">
                        {isSorted ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
            {rowActions.length > 0 && (
              <th scope="col" className="adm-th adm-th--right">
                <span className="adm-sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = idOf(row);
            const label = String(columns[0].accessor(row) ?? id);
            return (
              <tr key={id} className="adm-tr">
                {columns.map((col, i) =>
                  i === 0 ? (
                    <th key={col.key} scope="row" className="adm-td adm-td--primary">
                      {onRowClick ? (
                        <button
                          type="button"
                          className="adm-btn adm-btn--ghost adm-btn--sm"
                          style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                          onClick={() => onRowClick(row)}
                          aria-label={`Open ${rowNoun} ${label}`}
                        >
                          {renderCell(col, row)}
                        </button>
                      ) : (
                        renderCell(col, row)
                      )}
                    </th>
                  ) : (
                    <td key={col.key} className={`adm-td adm-td--${col.align ?? defaultAlign(col)}`}>
                      {renderCell(col, row)}
                    </td>
                  )
                )}
                {rowActions.length > 0 && (
                  <td className="adm-td adm-td--right">
                    <div className="adm-row-actions">
                      {rowActions.map((a) => (
                        <RowAction key={a.key} action={a} row={row} label={label} onAction={onAction} />
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function renderCell<T>(col: ColumnDef<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  const value = col.accessor(row);
  if (col.type === 'status') return <StatusBadge value={value == null ? null : String(value)} />;
  return formatCell(value, col);
}

/** Numbers and money right-align by default so digits line up for scanning. */
function defaultAlign<T>(col: ColumnDef<T>): 'left' | 'right' {
  return col.type === 'currency' || col.type === 'number' ? 'right' : 'left';
}

function RowAction<T>({
  action,
  row,
  label,
  onAction
}: {
  action: ActionDef<T>;
  row: T;
  label: string;
  onAction?: (a: ActionDef<T>, row: T) => void;
}) {
  const allowed = usePermission(action.permission);
  if (action.visible && !action.visible(row)) return null;
  // Hidden when irrelevant; disabled with a reason when the operator might
  // reasonably expect it.
  if (!allowed && !action.disabledHint) return null;

  return (
    <button
      type="button"
      className={`adm-btn adm-btn--sm adm-btn--${action.variant ?? 'default'}`}
      disabled={!allowed}
      title={!allowed ? action.disabledHint : undefined}
      aria-label={`${action.label} ${label}`}
      onClick={() => onAction?.(action, row)}
    >
      {action.label}
    </button>
  );
}

/** Priority-1 columns only, plus the first two actions. */
function MobileCard<T>({
  row,
  columns,
  actions,
  onAction,
  onOpen
}: {
  row: T;
  columns: ColumnDef<T>[];
  actions: ActionDef<T>[];
  onAction?: (a: ActionDef<T>, row: T) => void;
  onOpen?: (row: T) => void;
}) {
  const [primary, ...rest] = columns;
  const status = columns.find((c) => c.type === 'status');
  const shown = rest.filter((c) => (c.priority ?? 3) === 1 && c !== status).slice(0, 3);
  const label = String(primary.accessor(row) ?? '');

  return (
    <li className="adm-card-item">
      <div className="adm-card-item-head">
        <span className="adm-card-item-title">
          {onOpen ? (
            <button
              type="button"
              className="adm-btn adm-btn--ghost adm-btn--sm"
              style={{ padding: 0, height: 'auto', fontWeight: 700 }}
              onClick={() => onOpen(row)}
            >
              {renderCell(primary, row)}
            </button>
          ) : (
            renderCell(primary, row)
          )}
        </span>
        {status && <StatusBadge value={String(status.accessor(row) ?? '')} />}
      </div>

      {shown.length > 0 && (
        <dl className="adm-card-item-fields">
          {shown.map((c) => (
            <div key={c.key} className="adm-card-item-field">
              <dt className="adm-micro-label">{c.header}</dt>
              <dd>{renderCell(c, row)}</dd>
            </div>
          ))}
        </dl>
      )}

      {actions.length > 0 && (
        <div className="adm-card-item-actions">
          {actions.slice(0, 2).map((a) => (
            <RowAction key={a.key} action={a} row={row} label={label} onAction={onAction} />
          ))}
        </div>
      )}
    </li>
  );
}
