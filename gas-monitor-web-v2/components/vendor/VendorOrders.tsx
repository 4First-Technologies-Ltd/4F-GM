'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bike, Clock } from 'lucide-react';
import { vendorApi, Branch, OrderStatus, VendorOrder } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { RIDER_STATUS_BADGE, RIDER_STATUS_LABEL, orderRef } from '@/lib/rider';
import { AcceptRejectActions } from '@/components/orders/AcceptRejectActions';

type StatusFilter = 'ALL' | OrderStatus;

const FILTERS: StatusFilter[] = ['ALL', 'CONFIRMED', 'ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'PENDING'];

export function VendorOrders() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const [o, b] = await Promise.all([vendorApi.getOrders(), vendorApi.getBranches()]);
      setOrders(o);
      setBranches(b.branches);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // New paid orders need accepting quickly, so keep the list fresh.
    const t = window.setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) => (filter === 'ALL' || o.status === filter) && (branchFilter === 'all' || o.branchId === branchFilter)
      ),
    [orders, filter, branchFilter]
  );
  const multiBranch = branches.length > 1;
  const toAccept = orders.filter((o) => o.status === 'CONFIRMED').length;

  return (
    <div className="rounded-2xl bg-card border border-border p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Incoming orders</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Accept a paid order and it goes to riders nearby. The first rider to take it collects it from you.
        </p>
        {!loading && toAccept > 0 && (
          <p className="mt-1 text-sm font-medium text-amber-700">
            {toAccept} paid {toAccept === 1 ? 'order needs' : 'orders need'} accepting.
          </p>
        )}
      </div>

      {multiBranch && (
        <div
          className="flex gap-2 mb-3 overflow-x-auto pb-2 -mx-2 px-2"
          role="tablist"
          aria-label="Filter orders by branch"
        >
          {[{ id: 'all', name: 'All branches' }, ...branches].map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={branchFilter === b.id}
              onClick={() => setBranchFilter(b.id)}
              className={`whitespace-nowrap px-3 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                branchFilter === b.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex gap-2 mb-6 overflow-x-auto pb-2 -mx-2 px-2"
        role="tablist"
        aria-label="Filter orders by status"
      >
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
            {f === 'ALL' ? 'All' : RIDER_STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {error && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3 mb-6"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading orders…</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No orders match this filter.</p>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Order', 'Customer', 'Size × Qty', 'Amount', 'Status', 'Rider / action'].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 text-sm">
                    <span className="font-mono font-medium text-foreground">{orderRef(order)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                    {multiBranch && (
                      <span className="block text-xs text-muted-foreground">
                        {branches.find((b) => b.id === order.branchId)?.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">
                    {order.consumer.name}
                    <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                      {order.deliveryAddress}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground whitespace-nowrap">
                    {order.cylinderSize} × {order.quantity}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground whitespace-nowrap">
                    {formatNaira(order.totalAmount)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${RIDER_STATUS_BADGE[order.status]}`}
                    >
                      {RIDER_STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {order.status === 'CONFIRMED' ? (
                      <AcceptRejectActions orderId={order.id} api={vendorApi} onDone={load} />
                    ) : order.rider ? (
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-foreground">
                          <Bike className="h-4 w-4 text-primary" aria-hidden="true" />
                          {order.rider.user.name}
                        </span>
                        <a href={`tel:${order.rider.phone}`} className="text-xs text-muted-foreground hover:text-foreground">
                          {order.rider.phone}
                        </a>
                      </span>
                    ) : order.status === 'ACCEPTED' ? (
                      <div className="space-y-1">
                        <span className="flex items-center gap-1.5 text-amber-700">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                          Waiting for a rider
                        </span>
                        <AcceptRejectActions orderId={order.id} api={vendorApi} onDone={load} canAccept={false} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
