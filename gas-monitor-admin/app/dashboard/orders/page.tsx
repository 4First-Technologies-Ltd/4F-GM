'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { IconPackage, IconBell, IconCheck, IconWallet } from '@/components/icons';
import { formatNaira } from '@/lib/format';
import { adminFetch } from '@/lib/api';

interface OrderRow {
  id: string;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  deliveryAddress: string;
  status: 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
  consumer: { name: string; email: string };
  vendor: { businessName: string } | null;
  supplierName: string | null;
}

const TABS = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL');

  const load = useCallback(() => {
    adminFetch('/orders')
      .then((res) => res.json())
      .then((data) => setOrders(data.orders));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const revenue = list
      .filter((o) => o.status === 'CONFIRMED' || o.status === 'DELIVERED')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    return {
      total: list.length,
      pending: list.filter((o) => o.status === 'PENDING').length,
      delivered: list.filter((o) => o.status === 'DELIVERED').length,
      revenue
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const list = orders ?? [];
    return tab === 'ALL' ? list : list.filter((o) => o.status === tab);
  }, [orders, tab]);

  return (
    <>
      <h1>Orders</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconPackage />
          </span>
          <div className="value">{stats.total}</div>
          <div className="label">Total orders</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconBell />
          </span>
          <div className="value">{stats.pending}</div>
          <div className="label">Pending</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="value">{stats.delivered}</div>
          <div className="label">Delivered</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconWallet />
          </span>
          <div className="value">{formatNaira(stats.revenue)}</div>
          <div className="label">Revenue</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`filter-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!orders ? (
          <p className="loading-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No orders match this filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Consumer</th>
                <th>Vendor</th>
                <th>Cylinder</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.consumer.name}
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{o.consumer.email}</span>
                  </td>
                  <td>{o.vendor?.businessName ?? o.supplierName ?? '—'}</td>
                  <td>{o.cylinderSize}</td>
                  <td>{o.quantity}</td>
                  <td>{formatNaira(o.totalAmount)}</td>
                  <td>
                    <span className={`badge badge-${o.status.toLowerCase()}`}>{o.status}</span>
                  </td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
