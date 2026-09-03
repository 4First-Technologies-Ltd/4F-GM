'use client';

import { useState, type ReactNode } from 'react';
import type { ActionDef, ResourceConfig } from './types';
import { useResource } from './use-resource';
import { DataTable } from '@/admin/primitives/data-table';
import { FilterBar } from '@/admin/primitives/filter-bar';
import { Pagination } from '@/admin/primitives/pagination';
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from '@/admin/primitives/states';
import { ConfirmDialog, Drawer } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { formatCell } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';

/**
 * The ONE list engine. Every module page is:
 *
 *   <ResourceList config={vendorsModule} />
 *
 * If you find yourself writing a second list component, extend this one or add
 * a registered column type instead.
 */
export function ResourceList<T>({
  config,
  toolbar
}: {
  config: ResourceConfig<T>;
  /** Module-specific content above the table — stat rows, alerts. */
  toolbar?: (ctx: { total: number; refresh: () => void }) => ReactNode;
}) {
  const r = useResource(config);
  const canRead = usePermission(config.permissions.read);

  const [pending, setPending] = useState<{ action: ActionDef<T>; row: T } | null>(null);
  const [detailRow, setDetailRow] = useState<T | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  if (!canRead) return <ForbiddenState permission={config.permissions.read} />;

  const idOf = (row: T) => String((row as Record<string, unknown>)[config.primaryKey]);

  async function execute(action: ActionDef<T>, row: T) {
    await action.run(row, {
      refresh: r.refresh,
      toast: (message) => {
        setToast(message);
        window.setTimeout(() => setToast(null), 4000);
      }
    });
  }

  function invoke(action: ActionDef<T>, row: T) {
    if (action.confirm) {
      setPending({ action, row });
      return;
    }
    void execute(action, row).catch(() => r.refresh());
  }

  const rowActions = config.readOnly ? [] : (config.rowActions ?? []);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">{config.label}</h1>
          {r.status !== 'loading' && (
            <p className="adm-page-meta" aria-live="polite">
              {r.total.toLocaleString()}{' '}
              {r.total === 1 ? config.labelSingular.toLowerCase() : config.label.toLowerCase()}
              {r.isFiltered ? ' matching filters' : ''}
            </p>
          )}
        </div>
        {(config.headerActions ?? []).length > 0 && (
          <div className="adm-page-actions">
            {config.headerActions!.map((a) => (
              <HeaderAction key={a.key} action={a} refresh={r.refresh} />
            ))}
          </div>
        )}
      </header>

      {toolbar?.({ total: r.total, refresh: r.refresh })}

      {(config.filters?.length || config.search) && (
        <FilterBar
          search={
            config.search
              ? { value: r.search, onChange: r.setSearch, placeholder: config.search.placeholder }
              : undefined
          }
          filters={config.filters ?? []}
          values={r.filters}
          onChange={r.setFilter}
          onReset={r.resetFilters}
          activeCount={r.activeFilterCount}
          localOnlyWarning={!r.serverFiltered}
        />
      )}

      {toast && (
        <div className="adm-alert" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <div className="adm-card">
        {r.status === 'loading' && <LoadingState rows={8} columns={config.columns.length} />}

        {r.status === 'error' && (
          <ErrorState
            title={`Could not load ${config.label.toLowerCase()}`}
            error={r.error}
            onRetry={r.refresh}
          />
        )}

        {r.status === 'empty' && !r.isFiltered && (
          <EmptyState
            title={config.emptyState?.title ?? `No ${config.label.toLowerCase()} yet`}
            description={
              config.emptyState?.description ??
              `${config.label} will appear here once they exist.`
            }
          />
        )}

        {r.status === 'empty' && r.isFiltered && (
          <EmptyState
            title={`No ${config.label.toLowerCase()} match these filters`}
            description="Try a different status, or clear the search."
            action={
              <button type="button" className="adm-btn" onClick={r.resetFilters}>
                Clear filters
              </button>
            }
          />
        )}

        {(r.status === 'success' || r.status === 'refetching') && (
          <>
            {r.status === 'refetching' && <div className="adm-progress" aria-hidden="true" />}
            <DataTable
              caption={`${config.label}, page ${r.page}`}
              columns={config.columns}
              rows={r.rows}
              idOf={idOf}
              sort={r.sort}
              onSort={r.toggleSort}
              rowActions={rowActions}
              onAction={invoke}
              onRowClick={config.detail ? (row) => setDetailRow(row) : undefined}
              rowNoun={config.labelSingular.toLowerCase()}
            />
            <Pagination
              total={r.total}
              page={r.page}
              pageSize={r.pageSize}
              onPageChange={r.setPage}
              onPageSizeChange={r.setPageSize}
            />
          </>
        )}
      </div>

      {pending && (
        <ConfirmDialog
          title={pending.action.confirm!.title}
          body={pending.action.confirm!.body}
          confirmLabel={pending.action.confirm!.confirmLabel}
          danger={pending.action.variant === 'danger'}
          typeToConfirm={pending.action.confirm!.typeToConfirm?.(pending.row)}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const p = pending;
            await execute(p.action, p.row);
            setPending(null);
          }}
        />
      )}

      {detailRow && config.detail && (
        <DetailDrawer<T>
          detail={config.detail}
          row={detailRow}
          actions={rowActions}
          onClose={() => setDetailRow(null)}
          onAction={(action, row) => {
            setDetailRow(null);
            invoke(action, row);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function HeaderAction({ action, refresh }: { action: ActionDef<void>; refresh: () => void }) {
  const allowed = usePermission(action.permission);
  const [busy, setBusy] = useState(false);
  if (!allowed && !action.disabledHint) return null;

  return (
    <button
      type="button"
      className={`adm-btn adm-btn--${action.variant ?? 'default'}`}
      disabled={!allowed || busy}
      title={!allowed ? action.disabledHint : undefined}
      onClick={async () => {
        setBusy(true);
        try {
          await action.run(undefined as void, { refresh, toast: () => {} });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Working…' : action.label}
    </button>
  );
}

function DetailAction<T>({
  action,
  row,
  onRun
}: {
  action: ActionDef<T>;
  row: T;
  onRun: (a: ActionDef<T>) => void;
}) {
  const allowed = usePermission(action.permission);
  if (action.visible && !action.visible(row)) return null;
  if (!allowed && !action.disabledHint) return null;

  return (
    <button
      type="button"
      className={`adm-btn adm-btn--${action.variant ?? 'default'}`}
      disabled={!allowed}
      title={!allowed ? action.disabledHint : undefined}
      onClick={() => onRun(action)}
    >
      {action.label}
    </button>
  );
}


/**
 * Extracted so the row keeps its `T` type. Inline, TypeScript narrows the
 * nullable state to NonNullable<T>, which no longer matches ActionDef<T>.
 */
function DetailDrawer<T>({
  detail,
  row,
  actions,
  onClose,
  onAction
}: {
  detail: NonNullable<ResourceConfig<T>['detail']>;
  row: T;
  actions: ActionDef<T>[];
  onClose: () => void;
  onAction: (action: ActionDef<T>, row: T) => void;
}) {
  const statusValue = detail.statusField
    ? String((row as Record<string, unknown>)[detail.statusField] ?? '')
    : null;

  return (
    <Drawer
      title={detail.title(row)}
      subtitle={detail.subtitle?.(row)}
      headerExtra={statusValue ? <StatusBadge value={statusValue} /> : null}
      onClose={onClose}
      footer={
        actions.length > 0 ? (
          <>
            {actions.map((a) => (
              <DetailAction key={a.key} action={a} row={row} onRun={(action) => onAction(action, row)} />
            ))}
          </>
        ) : null
      }
    >
      {detail.sections.map((section) => (
        <section key={section.title} className="adm-detail-section">
          <h3 className="adm-micro-label">{section.title}</h3>
          <dl className="adm-detail-fields">
            {section.fields.map((f) => (
              <div key={f.key} className={`adm-detail-field${f.full ? ' adm-detail-field--full' : ''}`}>
                <dt className="adm-micro-label">{f.label}</dt>
                <dd className="adm-detail-field-value">
                  {f.render ? (
                    f.render(row)
                  ) : f.type === 'status' ? (
                    <StatusBadge value={String(f.accessor(row) ?? '')} />
                  ) : (
                    formatCell(f.accessor(row), f)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {detail.extra?.(row)}
    </Drawer>
  );
}

