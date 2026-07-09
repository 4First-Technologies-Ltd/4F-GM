'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/api';
import { formatNaira, STATUS_LABEL } from '@/lib/format';
import VendorOverview from '@/components/dashboard/VendorOverview';

const STATUS_ORDER: Order['status'][] = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  if (user?.role === 'VENDOR') {
    return <VendorOverview />;
  }
  return <ConsumerOverview />;
}

function ConsumerOverview() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ordersApi
      .list()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const totalSpend = orders
      .filter((o) => o.status === 'CONFIRMED' || o.status === 'DELIVERED')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const pending = orders.filter((o) => o.status === 'PENDING').length;
    const byStatus = STATUS_ORDER.map((status) => ({
      status,
      count: orders.filter((o) => o.status === status).length
    }));
    const max = Math.max(1, ...byStatus.map((s) => s.count));
    return { totalSpend, pending, total: orders.length, byStatus, max };
  }, [orders]);

  const recentOrders = orders.slice(0, 5);

  return (
    <>
      <p className="dashboard-welcome">Welcome back, {user?.name.split(' ')[0]}. Here&apos;s how your account is doing.</p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section className="kpi-grid">
        <div className="card kpi-card">
          <span className="kpi-label">Total orders</span>
          <strong className="kpi-value">{loading ? '—' : stats.total}</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Pending</span>
          <strong className="kpi-value">{loading ? '—' : stats.pending}</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Total spend</span>
          <strong className="kpi-value">{loading ? '—' : formatNaira(stats.totalSpend)}</strong>
        </div>
        <div className="card kpi-card kpi-card-accent">
          <span className="kpi-label">Need a refill?</span>
          <Link href="/dashboard/orders" className="btn btn-primary btn-sm">
            Place an order
          </Link>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <h2>Orders by status</h2>
          {orders.length === 0 && !loading ? (
            <p className="hero-card-sub">No orders yet — your breakdown will appear here.</p>
          ) : (
            <ul className="status-breakdown" aria-label="Orders by status">
              {stats.byStatus.map((s) => (
                <li key={s.status} className="status-breakdown-row">
                  <span className={`status-pill status-${s.status.toLowerCase()}`}>{STATUS_LABEL[s.status]}</span>
                  <span className="status-breakdown-bar-track">
                    <span
                      className={`status-breakdown-bar status-breakdown-bar-${s.status.toLowerCase()}`}
                      style={{ width: `${(s.count / stats.max) * 100}%` }}
                    />
                  </span>
                  <span className="status-breakdown-count">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="dashboard-card-head">
            <h2>Recent orders</h2>
            <Link href="/dashboard/orders" className="link-underline">
              View all
            </Link>
          </div>
          {loading && <p className="hero-card-sub">Loading orders…</p>}
          {!loading && recentOrders.length === 0 && (
            <p className="hero-card-sub">
              No orders yet.{' '}
              <Link href="/dashboard/orders" className="link-underline">
                Place your first refill order
              </Link>
              .
            </p>
          )}
          {recentOrders.length > 0 && (
            <ul className="recent-order-list">
              {recentOrders.map((order) => (
                <li key={order.id} className="recent-order-row">
                  <div>
                    <strong>{order.supplierName ?? 'Order'}</strong>
                    <span className="hero-card-sub">
                      {order.cylinderSize} × {order.quantity} · {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="recent-order-meta">
                    <span>{formatNaira(order.totalAmount)}</span>
                    <span className={`status-pill status-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
