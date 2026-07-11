'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/api';
import { STATUS_LABEL, formatNaira } from '@/lib/format';
import VendorOrders from '@/components/dashboard/VendorOrders';

type StatusFilter = 'ALL' | Order['status'];

const FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function OrdersPage() {
  const { user } = useAuth();
  if (user?.role === 'VENDOR') {
    return <VendorOrders />;
  }
  return <OrdersPageContent />;
}

function OrdersPageContent() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  useEffect(() => {
    let cancelled = false;
    ordersApi
      .list()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) setOrdersError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredOrders = useMemo(
    () => (filter === 'ALL' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  return (
    <div className="card dashboard-orders">
      <div className="dashboard-card-head">
        <h2>Your orders</h2>
        <a href="/marketplace" className="btn btn-primary btn-sm">
          Order a refill
        </a>
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

      {ordersLoading && <p className="hero-card-sub">Loading orders…</p>}
      {ordersError && (
        <p className="form-error" role="alert">
          {ordersError}
        </p>
      )}
      {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
        <p className="hero-card-sub">No orders match this filter.</p>
      )}
      {filteredOrders.length > 0 && (
        <div className="order-table" role="table">
          <div className="order-row order-row-head" role="row">
            <span role="columnheader">Supplier</span>
            <span role="columnheader">Size × Qty</span>
            <span role="columnheader">Amount</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Placed</span>
          </div>
          {filteredOrders.map((order) => (
            <div className="order-row" role="row" key={order.id}>
              <span role="cell">{order.supplierName ?? '—'}</span>
              <span role="cell">
                {order.cylinderSize} × {order.quantity}
              </span>
              <span role="cell">{formatNaira(order.totalAmount)}</span>
              <span role="cell">
                <span className={`status-pill status-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</span>
              </span>
              <span role="cell">{new Date(order.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
