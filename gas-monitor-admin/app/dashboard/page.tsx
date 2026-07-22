'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatNaira } from '@/lib/format';
import { IconUsers, IconStore, IconPackage } from '@/components/icons';
import { adminFetch } from '@/lib/api';

interface Stats {
  userCount: number;
  vendorPending: number;
  vendorApproved: number;
  vendorRejected: number;
  orderCount: number;
  listingCount: number;
  revenue: number;
  pendingValue: number;
  avgOrderValue: number;
}

interface Analytics {
  monthly: { month: string; revenue: number; orders: number }[];
  statusBreakdown: { status: string; count: number }[];
  topVendors: { id: string; businessName: string; orders: number; revenue: number }[];
}

const ACCENT = '#12271D';
const ACCENT_SOFT = '#A9714C';

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  useEffect(() => {
    adminFetch('/stats')
      .then((res) => res.json())
      .then(setStats);
    adminFetch('/analytics')
      .then((res) => res.json())
      .then(setAnalytics);
  }, []);

  const vendorTotal = stats ? stats.vendorPending + stats.vendorApproved + stats.vendorRejected : 0;
  const realizedTotal = stats ? stats.revenue + stats.pendingValue : 0;
  const realizedPct = realizedTotal > 0 ? ((stats?.revenue ?? 0) / realizedTotal) * 100 : 0;
  const pendingPct = 100 - realizedPct;

  return (
    <>
      <h1>Dashboard</h1>

      {!stats ? (
        <p className="loading-state">Loading…</p>
      ) : (
        <>
          <div className="top-stat-row">
            <div className="card stat-card-sm">
              <span className="stat-icon" aria-hidden="true">
                <IconUsers />
              </span>
              <div className="label">Total users</div>
              <div className="value">{stats.userCount}</div>
            </div>
            <div className="card stat-card-sm">
              <span className="stat-icon" aria-hidden="true">
                <IconStore />
              </span>
              <div className="label">Total vendors</div>
              <div className="value">{vendorTotal}</div>
            </div>
            <div className="card stat-card-sm">
              <span className="stat-icon" aria-hidden="true">
                <IconPackage />
              </span>
              <div className="label">Total orders</div>
              <div className="value">{stats.orderCount}</div>
            </div>

            <div className="card wide-stat-card">
              <div className="wide-stat-row">
                <span className="label">Total revenue</span>
                <strong className="value">{formatNaira(stats.revenue)}</strong>
              </div>
              <div className="wide-stat-row">
                <span className="label">Pending value</span>
                <strong className="value">{formatNaira(stats.pendingValue)}</strong>
              </div>
              <div className="wide-stat-row wide-stat-row-last">
                <span className="label">Avg order value</span>
                <strong className="value">{formatNaira(stats.avgOrderValue)}</strong>
              </div>

              <div className="wide-legend">
                <span>
                  <i className="legend-dot legend-dot-ink" /> Realized
                </span>
                <span>
                  <i className="legend-dot legend-dot-accent" /> Pending
                </span>
              </div>
              <div className="wide-bar-track">
                <div className="wide-bar wide-bar-ink" style={{ width: `${realizedPct}%` }} />
              </div>
              <div className="wide-bar-track">
                <div className="wide-bar wide-bar-accent" style={{ width: `${pendingPct}%` }} />
              </div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Vendor status</h2>
            <div className="segment-row">
              <div className="segment">
                <div className="segment-value">{stats.vendorPending}</div>
                <div className="segment-label">Pending</div>
              </div>
              <div className="segment">
                <div className="segment-value">{stats.vendorApproved}</div>
                <div className="segment-label">Approved</div>
              </div>
              <div className="segment">
                <div className="segment-value">{stats.vendorRejected}</div>
                <div className="segment-label">Rejected</div>
              </div>
            </div>
            <div className="segment-bar-track">
              {vendorTotal === 0 ? (
                <div className="segment-bar-fill" style={{ width: '100%', background: '#e2ded3' }} />
              ) : (
                <>
                  <div
                    className="segment-bar-fill"
                    style={{ width: `${(stats.vendorPending / vendorTotal) * 100}%`, background: 'var(--accent)' }}
                  />
                  <div
                    className="segment-bar-fill"
                    style={{ width: `${(stats.vendorApproved / vendorTotal) * 100}%`, background: 'var(--accent-dark)' }}
                  />
                  <div
                    className="segment-bar-fill"
                    style={{ width: `${(stats.vendorRejected / vendorTotal) * 100}%`, background: 'var(--danger)' }}
                  />
                </>
              )}
            </div>
          </div>

          {!analytics ? (
            <p className="loading-state">Loading analytics…</p>
          ) : (
            <>
              <div className="card">
                <h2 style={{ marginTop: 0 }}>Revenue trend (last 6 months)</h2>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <LineChart data={analytics.monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2ded3" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} width={56} />
                      <Tooltip formatter={(value) => formatNaira(Number(value))} />
                      <Line type="monotone" dataKey="revenue" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} name="Revenue" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <h2 style={{ marginTop: 0 }}>Orders by status</h2>
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={analytics.statusBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2ded3" />
                      <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={32} />
                      <Tooltip />
                      <Bar dataKey="count" fill={ACCENT_SOFT} radius={[4, 4, 0, 0]} name="Orders" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card">
                <h2 style={{ marginTop: 0 }}>Top vendors by revenue</h2>
                {analytics.topVendors.length === 0 ? (
                  <p className="empty-state">No vendor orders yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Orders</th>
                        <th>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.topVendors.map((v) => (
                        <tr key={v.id}>
                          <td>{v.businessName}</td>
                          <td>{v.orders}</td>
                          <td>{formatNaira(v.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
