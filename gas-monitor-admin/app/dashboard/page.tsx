'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson } from '@/admin/data/source';
import { formatNaira, formatNairaCompact, formatNumber, formatRelative, shortId } from '@/admin/primitives/format';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { ErrorState, InlineError, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import type { OrderRow, StatsResponse, VendorRow } from '@/admin/modules/types';
import { IconPackage, IconStore, IconUsers, IconWallet } from '@/components/icons';

/**
 * Overview — a TRIAGE screen, not a trophy case.
 *
 * Leads with what needs action (pending vendor approvals), then the metrics,
 * then the queues. The alert band renders only when something is actually
 * pending; an alert that shows when nothing is wrong stops being read.
 *
 * Every figure comes from the server's /stats endpoint, which aggregates over
 * the whole table. The previous implementation summed a capped 200-row page in
 * the browser and labelled the result "total revenue".
 */

interface Paginated<T> {
  data: T[];
  pagination: { total: number };
}

export default function OverviewPage() {
  const canSeeVendors = usePermission('vendors.read');
  const canSeeOrders = usePermission('orders.read');
  const canApprove = usePermission('vendors.approve');

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsError, setStatsError] = useState<Error | null>(null);

  const [pendingVendors, setPendingVendors] = useState<VendorRow[] | null>(null);
  const [vendorsError, setVendorsError] = useState<string | null>(null);

  const [recentOrders, setRecentOrders] = useState<OrderRow[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    setStatsError(null);
    getJson<StatsResponse>('/stats')
      .then(setStats)
      .catch((e) => setStatsError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  const loadQueues = useCallback(() => {
    if (canSeeVendors) {
      setVendorsError(null);
      getJson<Paginated<VendorRow>>('/vendors?status=PENDING&limit=6')
        .then((r) => setPendingVendors(r.data))
        .catch((e) => setVendorsError(e instanceof Error ? e.message : String(e)));
    } else {
      setPendingVendors([]);
    }

    if (canSeeOrders) {
      setOrdersError(null);
      getJson<Paginated<OrderRow>>('/orders?limit=8')
        .then((r) => setRecentOrders(r.data))
        .catch((e) => setOrdersError(e instanceof Error ? e.message : String(e)));
    } else {
      setRecentOrders([]);
    }
  }, [canSeeVendors, canSeeOrders]);

  useEffect(() => {
    loadStats();
    loadQueues();
  }, [loadStats, loadQueues]);

  async function decide(vendor: VendorRow, status: 'APPROVED' | 'REJECTED') {
    setBusyId(vendor.id);
    try {
      const { patchJson } = await import('@/admin/data/source');
      await patchJson(`/vendors/${vendor.id}`, { status });
      loadStats();
      loadQueues();
    } catch (e) {
      setVendorsError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = stats?.vendorPending ?? 0;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Overview</h1>
          <p className="adm-page-meta">Platform health and anything waiting on you.</p>
        </div>
      </header>

      {/* Rendered only when there is genuinely something to act on. */}
      {pendingCount > 0 && canSeeVendors && (
        <div className="adm-alert" role="status">
          <span>
            {pendingCount} vendor {pendingCount === 1 ? 'application is' : 'applications are'} waiting for
            review.
          </span>
          <Link className="adm-btn adm-btn--sm" href="/dashboard/vendors?status=PENDING">
            Review now
          </Link>
        </div>
      )}

      {statsError ? (
        <ErrorState title="Could not load platform stats" error={statsError} onRetry={loadStats} />
      ) : (
        <StatGrid>
          <StatCard
            label="Confirmed revenue"
            value={stats ? formatNairaCompact(stats.revenue) : '—'}
            valueTitle={stats ? formatNaira(stats.revenue) : undefined}
            caption="Confirmed and delivered orders"
            icon={<IconWallet />}
            loading={!stats}
          />
          <StatCard
            label="Orders"
            value={stats ? formatNumber(stats.orderCount) : '—'}
            caption={stats ? `Avg ${formatNaira(stats.avgOrderValue)}` : undefined}
            icon={<IconPackage />}
            href="/dashboard/orders"
            loading={!stats}
          />
          <StatCard
            label="Approved vendors"
            value={stats ? formatNumber(stats.vendorApproved) : '—'}
            caption={stats ? `${formatNumber(stats.listingCount)} listings` : undefined}
            icon={<IconStore />}
            href="/dashboard/vendors?status=APPROVED"
            loading={!stats}
          />
          <StatCard
            label="Pending approvals"
            value={stats ? formatNumber(stats.vendorPending) : '—'}
            caption="Vendors awaiting review"
            icon={<IconUsers />}
            href="/dashboard/vendors?status=PENDING"
            actionable={pendingCount > 0}
            loading={!stats}
          />
        </StatGrid>
      )}

      <div className="adm-chart-grid">
        {canSeeVendors && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-section-title">Awaiting approval</h2>
              <Link className="adm-btn adm-btn--sm" href="/dashboard/vendors?status=PENDING">
                View all
              </Link>
            </div>
            {vendorsError ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <InlineError message={vendorsError} onRetry={loadQueues} />
              </div>
            ) : pendingVendors === null ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <LoadingBlock height={140} />
              </div>
            ) : pendingVendors.length === 0 ? (
              <div className="adm-state">
                <p className="adm-state-desc">Nothing waiting. All vendor applications are reviewed.</p>
              </div>
            ) : (
              <ul className="adm-card-list">
                {pendingVendors.map((v) => (
                  <li key={v.id} className="adm-card-item">
                    <div className="adm-card-item-head">
                      <span className="adm-card-item-title">{v.businessName}</span>
                      <span className="adm-audit-time">{formatRelative(v.createdAt)}</span>
                    </div>
                    <dl className="adm-card-item-fields">
                      <div className="adm-card-item-field">
                        <dt className="adm-micro-label">Owner</dt>
                        <dd>{v.user.name}</dd>
                      </div>
                      <div className="adm-card-item-field">
                        <dt className="adm-micro-label">Documents</dt>
                        <dd>{v.documents.length}</dd>
                      </div>
                    </dl>
                    {/* Triage without navigating — the point of a queue. */}
                    {canApprove && (
                      <div className="adm-card-item-actions">
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm adm-btn--primary"
                          disabled={busyId === v.id}
                          onClick={() => decide(v, 'APPROVED')}
                          aria-label={`Approve ${v.businessName}`}
                        >
                          {busyId === v.id ? 'Working…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm adm-btn--danger"
                          disabled={busyId === v.id}
                          onClick={() => decide(v, 'REJECTED')}
                          aria-label={`Reject ${v.businessName}`}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {canSeeOrders && (
          <section className="adm-card">
            <div className="adm-card-head">
              <h2 className="adm-section-title">Recent orders</h2>
              <Link className="adm-btn adm-btn--sm" href="/dashboard/orders">
                View all
              </Link>
            </div>
            {ordersError ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <InlineError message={ordersError} onRetry={loadQueues} />
              </div>
            ) : recentOrders === null ? (
              <div style={{ padding: 'var(--space-4)' }}>
                <LoadingBlock height={140} />
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="adm-state">
                <p className="adm-state-desc">No orders yet.</p>
              </div>
            ) : (
              <ul className="adm-card-list">
                {recentOrders.map((o) => (
                  <li key={o.id} className="adm-card-item">
                    <div className="adm-card-item-head">
                      <span className="adm-card-item-title" style={{ fontFamily: 'var(--font-mono)' }}>
                        {shortId(o.id)}
                      </span>
                      <StatusBadge value={o.status} />
                    </div>
                    <dl className="adm-card-item-fields">
                      <div className="adm-card-item-field">
                        <dt className="adm-micro-label">Customer</dt>
                        <dd>{o.consumer.name}</dd>
                      </div>
                      <div className="adm-card-item-field">
                        <dt className="adm-micro-label">Total</dt>
                        <dd className="adm-num">{formatNaira(o.totalAmount)}</dd>
                      </div>
                      <div className="adm-card-item-field">
                        <dt className="adm-micro-label">Placed</dt>
                        <dd>{formatRelative(o.createdAt)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
