'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatNaira, formatNumber, formatRelative, shortId } from '@/admin/primitives/format';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import { ConfirmDialog } from '@/admin/primitives/dialog';

/**
 * Dispatch — the rider job pool and the dispatch watcher's suggestions.
 * Vendors accept orders, riders choose jobs from the pool; this page is the
 * fallback when nobody takes one. The watcher alerts nearby riders by itself,
 * then suggests a rider, then suggests cancelling (which opens a refund ticket).
 */

type SuggestionStatus = 'OPEN' | 'APPLIED' | 'DISMISSED' | 'EXPIRED';
type Action = 'NOTIFY_RIDERS' | 'ASSIGN_RIDER' | 'CANCEL_ORDER' | 'FOLLOW_UP_VENDOR' | 'FOLLOW_UP_DELIVERY';

interface Suggestion {
  id: string;
  action: Action;
  status: SuggestionStatus;
  title: string;
  reason: string;
  payload: { riderName?: string; distanceKm?: number | null; phone?: string | null; notified?: number } | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  order: {
    id: string;
    status: string;
    supplierName: string | null;
    cylinderSize: string;
    quantity: number;
    deliveryAddress: string;
    totalAmount: number;
    poolEnteredAt: string | null;
    consumer: { name: string; phone: string | null };
  };
}

interface PoolOrder {
  id: string;
  supplierName: string | null;
  cylinderSize: string;
  quantity: number;
  deliveryAddress: string;
  poolEnteredAt: string | null;
  branch: { name: string; city: string | null } | null;
}

interface DispatchResponse {
  suggestions: Suggestion[];
  pool: PoolOrder[];
  awaitingVendor: number;
  onlineRiders: number;
}

const ACTION_LABEL: Record<Action, string> = {
  NOTIFY_RIDERS: 'Riders alerted',
  ASSIGN_RIDER: 'Assign rider',
  CANCEL_ORDER: 'Cancel and refund',
  FOLLOW_UP_VENDOR: 'Call vendor',
  FOLLOW_UP_DELIVERY: 'Call rider'
};

const APPLY_LABEL: Record<Action, string> = {
  NOTIFY_RIDERS: 'Done',
  ASSIGN_RIDER: 'Assign',
  CANCEL_ORDER: 'Cancel order',
  FOLLOW_UP_VENDOR: 'Mark done',
  FOLLOW_UP_DELIVERY: 'Mark done'
};

const TABS: { value: SuggestionStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'APPLIED', label: 'Applied' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'EXPIRED', label: 'Expired' }
];

const minutesSince = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : null);

export default function DispatchPage() {
  const canRead = usePermission('dispatch.read');
  const canManage = usePermission('dispatch.manage');
  const [tab, setTab] = useState<SuggestionStatus>('OPEN');
  const [data, setData] = useState<DispatchResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Suggestion | null>(null);

  const load = useCallback(() => {
    if (!canRead) return;
    getJson<DispatchResponse>(`/dispatch?status=${tab}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [canRead, tab]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function act(s: Suggestion, kind: 'apply' | 'dismiss') {
    // Cancelling a paid order asks for a reason first (see the dialog below).
    if (kind === 'apply' && s.action === 'CANCEL_ORDER') {
      setCancelling(s);
      return;
    }
    setBusy(s.id);
    setActionError(null);
    try {
      await sendJson('POST', `/dispatch/${s.id}/${kind}`, {});
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!canRead) return <ForbiddenState permission="dispatch.read" />;

  return (
    <div className="adm-page">
      <h1 className="adm-page-title">Dispatch</h1>
      <p className="adm-muted" style={{ marginTop: 'var(--space-2)' }}>
        Vendors accept paid orders and riders choose jobs from the pool. When a job waits too long, the watcher
        alerts nearby riders, then suggests a rider, then suggests cancelling. Thresholds are under Settings → Dispatch.
      </p>

      {error && <ErrorState title="Could not load dispatch" error={error} onRetry={load} />}
      {!data && !error && <LoadingBlock />}

      {data && (
        <>
          <StatGrid>
            <StatCard label="Jobs in the pool" value={formatNumber(data.pool.length)} actionable={data.pool.length > 0} />
            <StatCard label="Paid, awaiting vendor" value={formatNumber(data.awaitingVendor)} actionable={data.awaitingVendor > 0} href="/dashboard/orders?status=CONFIRMED" />
            <StatCard label="Riders online" value={formatNumber(data.onlineRiders)} />
          </StatGrid>

          <section className="adm-card adm-card-pad" style={{ marginTop: 'var(--space-5)' }}>
            <h2 className="adm-section-title">Job pool</h2>
            {data.pool.length === 0 ? (
              <p className="adm-muted" style={{ marginTop: 'var(--space-2)' }}>
                No accepted orders are waiting for a rider.
              </p>
            ) : (
              <div className="adm-table-scroll" style={{ marginTop: 'var(--space-3)' }}>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Pickup</th>
                      <th>Deliver to</th>
                      <th>Waiting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pool.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/dashboard/orders?q=${o.id}`} style={{ fontFamily: 'var(--font-mono)' }}>
                            {shortId(o.id)}
                          </Link>
                          <span className="adm-td-sub">
                            {o.cylinderSize} × {o.quantity}
                          </span>
                        </td>
                        <td>
                          {o.supplierName ?? '4FG'}
                          {o.branch && (
                            <span className="adm-td-sub">
                              {o.branch.name}
                              {o.branch.city ? ` · ${o.branch.city}` : ''}
                            </span>
                          )}
                        </td>
                        <td>{o.deliveryAddress}</td>
                        <td title={o.poolEnteredAt ? formatDateTime(o.poolEnteredAt) : undefined}>
                          {minutesSince(o.poolEnteredAt) != null ? `${minutesSince(o.poolEnteredAt)} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="adm-card adm-card-pad" style={{ marginTop: 'var(--space-5)' }}>
            <h2 className="adm-section-title">Suggestions</h2>
            <div className="adm-segmented" role="tablist" aria-label="Suggestion status" style={{ marginTop: 'var(--space-3)' }}>
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  className={`adm-btn adm-btn--sm${tab === t.value ? ' adm-btn--primary' : ''}`}
                  onClick={() => setTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {actionError && (
              <p role="alert" style={{ color: 'var(--error)', marginTop: 'var(--space-3)' }}>
                {actionError}
              </p>
            )}

            {data.suggestions.length === 0 ? (
              <EmptyState
                title={tab === 'OPEN' ? 'Nothing needs you' : 'None yet'}
                description={tab === 'OPEN' ? 'Every waiting order is within its thresholds.' : undefined}
              />
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--space-3) 0 0', display: 'grid', gap: 'var(--space-3)' }}>
                {data.suggestions.map((s) => (
                  <li key={s.id} className="adm-card adm-card-pad">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600 }}>
                          <StatusBadge value={s.order.status} /> {s.title}
                        </p>
                        <p className="adm-muted" style={{ marginTop: 4 }}>
                          {s.reason}
                        </p>
                        <p className="adm-td-sub" style={{ marginTop: 4 }}>
                          {ACTION_LABEL[s.action]} · {s.order.consumer.name}
                          {s.order.consumer.phone ? ` (${s.order.consumer.phone})` : ''} · {formatNaira(s.order.totalAmount)} ·{' '}
                          {formatRelative(s.createdAt)}
                          {s.resolvedByName && ` · ${s.status.toLowerCase()} by ${s.resolvedByName}`}
                        </p>
                      </div>
                      {s.status === 'OPEN' && canManage && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <button
                            type="button"
                            className={`adm-btn adm-btn--sm${s.action === 'CANCEL_ORDER' ? ' adm-btn--danger' : ' adm-btn--primary'}`}
                            disabled={busy === s.id}
                            onClick={() => act(s, 'apply')}
                          >
                            {busy === s.id ? 'Working…' : APPLY_LABEL[s.action]}
                          </button>
                          <button type="button" className="adm-btn adm-btn--sm" disabled={busy === s.id} onClick={() => act(s, 'dismiss')}>
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {cancelling && (
        <ConfirmDialog
          title={`Cancel order ${shortId(cancelling.order.id)}?`}
          body="The customer has paid. The order is cancelled, they are told why, and a refund ticket opens in the Support inbox for you to refund them by hand. This cannot be undone."
          confirmLabel="Cancel order"
          cancelLabel="Keep order"
          danger
          reasonLabel="Reason (shown to the customer)"
          onCancel={() => setCancelling(null)}
          onConfirm={async (reason) => {
            await sendJson('POST', `/dispatch/${cancelling.id}/apply`, { reason });
            setCancelling(null);
            load();
          }}
        />
      )}
    </div>
  );
}
