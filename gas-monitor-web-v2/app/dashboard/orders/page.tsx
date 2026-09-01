'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/api';
import { STATUS_LABEL, formatNaira } from '@/lib/format';
import { AlertCircle } from 'lucide-react';

type StatusFilter = 'ALL' | Order['status'];

const FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

const STATUS_BADGE_COLORS: Record<Order['status'], string> = {
  PENDING: 'bg-amber-100/50 text-amber-700',
  CONFIRMED: 'bg-blue-100/50 text-blue-700',
  DELIVERED: 'bg-green-100/50 text-green-700',
  CANCELLED: 'bg-red-100/50 text-red-700'
};

export default function OrdersPage() {
  const { user } = useAuth();
  if (user?.role === 'VENDOR') {
    // TODO: Create VendorOrders component
    return (
      <div className="rounded-2xl bg-card border border-border p-6">
        <p className="text-muted-foreground">Vendor orders view coming soon.</p>
      </div>
    );
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
    <div className="rounded-2xl bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Your orders</h2>
        <Link
          href="/marketplace"
          className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Order a refill
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2" role="tablist" aria-label="Filter orders by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`whitespace-nowrap px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
              filter === f
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Error State */}
      {ordersError && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3 mb-6"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{ordersError}</div>
        </div>
      )}

      {/* Loading State */}
      {ordersLoading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading orders…</p>
      )}

      {/* Empty State */}
      {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No orders match this filter.</p>
      )}

      {/* Orders Table */}
      {filteredOrders.length > 0 && (
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Size × Qty
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Placed
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredOrders.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm text-foreground">
                    {order.supplierName ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {order.cylinderSize} × {order.quantity}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    {formatNaira(order.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_COLORS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
