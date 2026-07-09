'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorProfile, VendorOrder } from '@/lib/api';
import { formatNaira, STATUS_LABEL } from '@/lib/format';

export default function VendorOverview() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([vendorApi.getProfile(), vendorApi.getOrders()])
      .then(([profileData, orderData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setOrders(orderData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your vendor dashboard.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const pending = orders.filter((o) => o.status === 'PENDING').length;
    const totalRevenue = orders
      .filter((o) => o.status === 'CONFIRMED' || o.status === 'DELIVERED')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    return { pending, totalRevenue, total: orders.length, listings: profile?.listings?.length ?? 0 };
  }, [orders, profile]);

  const recentOrders = orders.slice(0, 5);

  return (
    <>
      <p className="dashboard-welcome">Welcome back, {user?.name.split(' ')[0]}. Here&apos;s how {profile?.businessName ?? 'your business'} is doing.</p>

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
          <span className="kpi-label">Needs action</span>
          <strong className="kpi-value">{loading ? '—' : stats.pending}</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Revenue</span>
          <strong className="kpi-value">{loading ? '—' : formatNaira(stats.totalRevenue)}</strong>
        </div>
        <div className="card kpi-card kpi-card-accent">
          <span className="kpi-label">Listings</span>
          <Link href="/dashboard/listings" className="btn btn-primary btn-sm">
            {loading ? 'Manage' : `${stats.listings} live`}
          </Link>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <div className="dashboard-card-head">
            <h2>Incoming orders</h2>
            <Link href="/dashboard/orders" className="link-underline">
              View all
            </Link>
          </div>
          {loading && <p className="hero-card-sub">Loading orders…</p>}
          {!loading && recentOrders.length === 0 && <p className="hero-card-sub">No orders yet.</p>}
          {recentOrders.length > 0 && (
            <ul className="recent-order-list">
              {recentOrders.map((order) => (
                <li key={order.id} className="recent-order-row">
                  <div>
                    <strong>{order.consumer.name}</strong>
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

        <div className="card">
          <h2>Business profile</h2>
          {profile && (
            <dl className="account-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <span className={`status-pill status-${profile.status === 'APPROVED' ? 'confirmed' : 'pending'}`}>
                    {profile.status === 'APPROVED' ? 'Approved' : profile.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Business name</dt>
                <dd>{profile.businessName}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{profile.businessAddress}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{profile.phone}</dd>
              </div>
            </dl>
          )}
        </div>
      </section>
    </>
  );
}
