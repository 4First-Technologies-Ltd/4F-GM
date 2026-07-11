'use client';

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { analyticsApi, Analytics } from '@/lib/api';
import { formatNaira, STATUS_LABEL } from '@/lib/format';
import { IconWallet, IconPackage, IconTag } from '@/components/icons';

const ACCENT = '#12271D';
const ACCENT_SOFT = '#A9714C';

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi
      .get()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics.'));
  }, []);

  if (error) {
    return (
      <p className="form-error" role="alert">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="hero-card-sub">Loading analytics…</p>;
  }

  const isVendor = data.role === 'VENDOR';
  const monthlyChartData = data.monthly.map((m) => ({
    month: m.month,
    value: isVendor ? (m as { revenue: number }).revenue : (m as { spend: number }).spend
  }));

  return (
    <>
      <p className="dashboard-welcome">
        {isVendor ? 'Revenue and order trends for your business.' : 'Your spending and order activity over time.'}
      </p>

      <section className="kpi-grid">
        <div className="card kpi-card">
          <span className="kpi-icon" aria-hidden="true">
            <IconWallet />
          </span>
          <span className="kpi-label">{isVendor ? 'Total revenue' : 'Total spend'}</span>
          <strong className="kpi-value">{formatNaira(isVendor ? data.totalRevenue : data.totalSpend)}</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon" aria-hidden="true">
            <IconPackage />
          </span>
          <span className="kpi-label">Total orders</span>
          <strong className="kpi-value">{data.totalOrders}</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon" aria-hidden="true">
            <IconTag />
          </span>
          <span className="kpi-label">Avg. order value</span>
          <strong className="kpi-value">{formatNaira(data.avgOrderValue)}</strong>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <h2>{isVendor ? 'Revenue trend' : 'Spend trend'} (last 6 months)</h2>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ded3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} width={56} />
                <Tooltip formatter={(value) => formatNaira(Number(value))} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={ACCENT}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  name={isVendor ? 'Revenue' : 'Spend'}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h2>Orders by status</h2>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data.statusBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2ded3" />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} tickFormatter={(s: string) => STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={32} />
                <Tooltip labelFormatter={(s) => STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s} />
                <Bar dataKey="count" fill={ACCENT_SOFT} radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {isVendor && (
        <section className="card">
          <h2>Top listings</h2>
          {data.topListings.length === 0 ? (
            <p className="hero-card-sub">No orders yet — top listings will appear here.</p>
          ) : (
            <div className="order-table" role="table">
              <div className="order-row order-row-head" role="row">
                <span role="columnheader">Listing</span>
                <span role="columnheader">Orders</span>
                <span role="columnheader">Revenue</span>
              </div>
              {data.topListings.map((l) => (
                <div className="order-row" role="row" key={l.id}>
                  <span role="cell">{l.name}</span>
                  <span role="cell">{l.orders}</span>
                  <span role="cell">{formatNaira(l.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
