'use client';

import { useEffect, useMemo, useState } from 'react';
import { vendorApi, VendorOrder } from '@/lib/api';
import { STATUS_LABEL, formatNaira } from '@/lib/format';

type StatusFilter = 'ALL' | VendorOrder['status'];

const FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function VendorOrders() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const data = await vendorApi.getOrders();
      setOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(
    () => (filter === 'ALL' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  async function updateStatus(id: string, status: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED') {
    setUpdatingId(id);
    try {
      const updated = await vendorApi.updateOrderStatus(id, status);
      setOrders((current) => current.map((o) => (o.id === id ? updated : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update order.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="card dashboard-orders">
      <div className="dashboard-card-head">
        <h2>Incoming orders</h2>
      </div>
      <div className="order-filter-tabs" role="tablist" aria-label="Filter orders by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            className={`order-filter-tab${filter === f ? ' is-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {loading && <p className="hero-card-sub">Loading orders…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!loading && filteredOrders.length === 0 && <p className="hero-card-sub">No orders match this filter.</p>}

      {filteredOrders.length > 0 && (
        <ul className="recent-order-list">
          {filteredOrders.map((order) => (
            <li key={order.id} className="recent-order-row">
              <div>
                <strong>{order.consumer.name}</strong>
                <span className="hero-card-sub">
                  {order.cylinderSize} × {order.quantity} · {formatNaira(order.totalAmount)} ·{' '}
                  {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <span className="hero-card-sub">{order.deliveryAddress}</span>
              </div>
              <div className="recent-order-meta">
                <span className={`status-pill status-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</span>
                {order.status === 'PENDING' && (
                  <div className="hero-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={updatingId === order.id}
                      onClick={() => updateStatus(order.id, 'CONFIRMED')}
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={updatingId === order.id}
                      onClick={() => updateStatus(order.id, 'CANCELLED')}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {order.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={updatingId === order.id}
                    onClick={() => updateStatus(order.id, 'DELIVERED')}
                  >
                    Mark delivered
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
