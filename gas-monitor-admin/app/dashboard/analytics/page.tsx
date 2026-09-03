'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { getJson } from '@/admin/data/source';
import { formatNaira, formatNairaCompact, formatNumber } from '@/admin/primitives/format';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import type { AnalyticsResponse } from '@/admin/modules/types';

/**
 * Analytics — driven entirely by the server's /analytics aggregate endpoint,
 * which computes over the whole table. Nothing here is derived in the browser
 * from a page of rows.
 *
 * recharts was already a dependency; no charting library was added.
 *
 * The endpoint has a fixed six-month window, so no date-range control is
 * offered — a control that cannot change the result is worse than none.
 */

const CHART = {
  1: 'var(--chart-1)',
  2: 'var(--chart-2)',
  3: 'var(--chart-3)',
  4: 'var(--chart-4)',
  5: 'var(--chart-5)'
} as const;

const STATUS_COLOUR: Record<string, string> = {
  PENDING: 'var(--warning)',
  CONFIRMED: 'var(--info)',
  DELIVERED: 'var(--success)',
  CANCELLED: 'var(--error)',
  APPROVED: 'var(--success)',
  REJECTED: 'var(--error)'
};

export default function AnalyticsPage() {
  const canRead = usePermission('analytics.read');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    setError(null);
    getJson<AnalyticsResponse>('/analytics')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  useEffect(load, [load]);

  if (!canRead) return <ForbiddenState permission="analytics.read" />;

  if (error) {
    return (
      <div className="adm-page">
        <h1 className="adm-page-title">Analytics</h1>
        <ErrorState title="Could not load analytics" error={error} onRetry={load} />
      </div>
    );
  }

  const hasTrend = (data?.monthly.length ?? 0) >= 2;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Analytics</h1>
          <p className="adm-page-meta">Platform totals, and the last six months of activity.</p>
        </div>
      </header>

      <StatGrid>
        <StatCard
          label="Total revenue"
          value={data ? formatNairaCompact(data.totalRevenue) : '—'}
          valueTitle={data ? formatNaira(data.totalRevenue) : undefined}
          caption="Confirmed and delivered"
          loading={!data}
        />
        <StatCard label="Total orders" value={data ? formatNumber(data.totalOrders) : '—'} loading={!data} />
        <StatCard label="Total users" value={data ? formatNumber(data.totalUsers) : '—'} loading={!data} />
        <StatCard label="Total vendors" value={data ? formatNumber(data.totalVendors) : '—'} loading={!data} />
      </StatGrid>

      <section className="adm-card adm-card-pad">
        <h2 className="adm-section-title">Revenue and orders over time</h2>
        <p className="adm-chart-caption">
          How much did we transact each month, and how many orders drove it?
        </p>
        {!data ? (
          <LoadingBlock height={260} />
        ) : !hasTrend ? (
          // A two-point "trend" is not a trend. Show the number instead.
          <p className="adm-state-desc" style={{ marginTop: 'var(--space-4)' }}>
            Not enough history yet — a trend needs at least two months of orders.
          </p>
        ) : (
          <div className="adm-chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.monthly} margin={{ top: 12, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <YAxis
                  yAxisId="revenue"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatNairaCompact(v)}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  stroke="var(--text-muted)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    fontSize: 12
                  }}
                  formatter={(value, name) =>
                    name === 'Revenue' ? formatNaira(value) : formatNumber(value)
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  name="Revenue"
                  stroke={CHART[1]}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="orders"
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke={CHART[2]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="adm-chart-grid">
        <section className="adm-card adm-card-pad">
          <h2 className="adm-section-title">Where do orders end up?</h2>
          {!data ? (
            <LoadingBlock height={220} />
          ) : (
            <div className="adm-chart-box" style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.statusBreakdown} margin={{ top: 12, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="status" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  {/* Bar axes always start at zero — a truncated one misrepresents
                      the comparison, which is the whole point of a bar chart. */}
                  <YAxis
                    stroke="var(--text-muted)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      fontSize: 12
                    }}
                  />
                  <Bar dataKey="count" name="Orders" radius={[2, 2, 0, 0]}>
                    {data.statusBreakdown.map((d) => (
                      <Cell key={d.status} fill={STATUS_COLOUR[d.status] ?? CHART[1]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="adm-card adm-card-pad">
          <h2 className="adm-section-title">Vendor funnel</h2>
          {!data ? (
            <LoadingBlock height={220} />
          ) : (
            <dl className="adm-detail-fields" style={{ gridTemplateColumns: '1fr' }}>
              {data.vendorFunnel.map((f) => (
                <div key={f.status} className="adm-detail-field">
                  <dt className="adm-micro-label">{f.status}</dt>
                  <dd className="adm-detail-field-value adm-num">{formatNumber(f.count)}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-section-title">Top vendors by revenue</h2>
        </div>
        {!data ? (
          <div style={{ padding: 'var(--space-4)' }}>
            <LoadingBlock height={140} />
          </div>
        ) : data.topVendors.length === 0 ? (
          <div className="adm-state">
            <p className="adm-state-desc">No vendor revenue recorded yet.</p>
          </div>
        ) : (
          <div className="adm-table-scroll">
            <table className="adm-table">
              <caption className="adm-sr-only">Top vendors by revenue</caption>
              <thead>
                <tr>
                  <th scope="col" className="adm-th">
                    Vendor
                  </th>
                  <th scope="col" className="adm-th adm-th--right">
                    Orders
                  </th>
                  <th scope="col" className="adm-th adm-th--right">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.topVendors.map((v) => (
                  <tr key={v.id} className="adm-tr">
                    <th scope="row" className="adm-td adm-td--primary">
                      {v.businessName}
                    </th>
                    <td className="adm-td adm-td--right">{formatNumber(v.orders)}</td>
                    <td className="adm-td adm-td--right">{formatNaira(v.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
