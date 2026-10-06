'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { AlertCircle, Package, Tag, Wallet } from 'lucide-react';

const ACCENT = '#2D7450';
const CLAY = '#A9714C';
const GRID = '#CFE0CF';

function KpiCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3" aria-hidden="true">
        {icon}
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}

function statusLabel(s: string) {
  return STATUS_LABEL[s as keyof typeof STATUS_LABEL] ?? s;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .get()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load analytics.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div
        className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3 max-w-2xl"
        role="alert"
      >
        <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div>{error}</div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading analytics…</p>;
  }

  const isVendor = data.role === 'VENDOR';
  const total = data.role === 'VENDOR' ? data.totalRevenue : data.totalSpend;
  const monthly =
    data.role === 'VENDOR'
      ? data.monthly.map((m) => ({ month: m.month, value: m.revenue }))
      : data.monthly.map((m) => ({ month: m.month, value: m.spend }));

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-sm text-muted-foreground">
        {isVendor ? 'Revenue and order trends for your business.' : 'Your spending and order activity over time.'}
      </p>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<Wallet className="h-5 w-5" />}
          label={isVendor ? 'Total revenue' : 'Total spend'}
          value={formatNaira(total)}
        />
        <KpiCard icon={<Package className="h-5 w-5" />} label="Total orders" value={data.totalOrders} />
        <KpiCard icon={<Tag className="h-5 w-5" />} label="Avg. order value" value={formatNaira(data.avgOrderValue)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card border border-border p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">
            {isVendor ? 'Revenue trend' : 'Spend trend'} (last 6 months)
          </h2>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `₦${(Number(v) / 1000).toFixed(0)}k`} width={56} />
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

        <div className="rounded-2xl bg-card border border-border p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Orders by status</h2>
          <div className="w-full h-64">
            <ResponsiveContainer>
              <BarChart data={data.statusBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} tickFormatter={statusLabel} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={32} />
                <Tooltip labelFormatter={(s) => statusLabel(String(s))} />
                <Bar dataKey="count" fill={CLAY} radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {data.role === 'VENDOR' && (
        <section className="rounded-2xl bg-card border border-border p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Top listings</h2>
          {data.topListings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet — top listings will appear here.</p>
          ) : (
            <div className="overflow-x-auto -mx-6 -mb-6">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listing</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Orders</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.topListings.map((l) => (
                    <tr key={l.id}>
                      <td className="px-6 py-4 text-sm text-foreground">{l.name}</td>
                      <td className="px-6 py-4 text-sm text-foreground">{l.orders}</td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{formatNaira(l.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
