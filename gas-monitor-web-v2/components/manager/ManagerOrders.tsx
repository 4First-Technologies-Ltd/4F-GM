'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bike, Clock } from 'lucide-react';
import { staffApi, type ManagerOrder, type StaffBranch } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { RIDER_STATUS_BADGE, RIDER_STATUS_LABEL, orderRef } from '@/lib/rider';
import { AcceptRejectActions } from '@/components/orders/AcceptRejectActions';

/** Unpaid (PENDING) orders never appear: payment confirms them, not a manager. */
const isActive = (o: ManagerOrder) => o.status === 'CONFIRMED' || o.status === 'ACCEPTED' || o.status === 'OUT_FOR_DELIVERY';
const isFinished = (o: ManagerOrder) => o.status === 'DELIVERED' || o.status === 'CANCELLED';

/**
 * A branch manager's orders: the branches they were invited to, nothing else.
 * They accept or reject paid orders; riders choose their own jobs from there.
 */
export function ManagerOrders() {
  const [branches, setBranches] = useState<StaffBranch[] | null>(null);
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, o] = await Promise.all([staffApi.me(), staffApi.getOrders()]);
      setBranches(b);
      setOrders(o);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load orders.');
      setBranches((b) => b ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const visible = useMemo(
    () => orders.filter((o) => o.status !== 'PENDING' && (filter === 'all' || o.branch?.id === filter)),
    [orders, filter]
  );
  // Orders waiting to be accepted first.
  const active = visible.filter(isActive).sort((a, b) => Number(b.status === 'CONFIRMED') - Number(a.status === 'CONFIRMED'));
  const finished = visible.filter(isFinished).slice(0, 20);
  const multi = (branches?.length ?? 0) > 1;

  const card = (o: ManagerOrder, withActions: boolean) => (
    <div key={o.id} className="rounded-xl bg-card border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-sm font-semibold text-foreground">{orderRef(o)}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${RIDER_STATUS_BADGE[o.status]}`}>
          {RIDER_STATUS_LABEL[o.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground">
        {o.quantity} × {o.cylinderSize} · {formatNaira(o.totalAmount)}
      </p>
      {multi && o.branch && <p className="text-xs text-muted-foreground">{o.branch.name}</p>}
      <p className="mt-1 text-sm text-foreground">{o.consumer.name}</p>
      {o.consumer.phone && (
        <a href={`tel:${o.consumer.phone}`} className="text-sm font-medium text-primary hover:text-primary/80">
          {o.consumer.phone}
        </a>
      )}
      <p className="text-xs text-muted-foreground">{o.deliveryAddress}</p>
      {o.rider ? (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Bike className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {o.rider.user.name} · {o.rider.phone}
        </p>
      ) : (
        withActions &&
        o.status === 'ACCEPTED' && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Waiting for a rider to take it
          </p>
        )
      )}

      {withActions && o.status === 'CONFIRMED' && (
        <div className="mt-3">
          <AcceptRejectActions orderId={o.id} api={staffApi} onDone={load} />
        </div>
      )}
      {withActions && o.status === 'ACCEPTED' && !o.rider && (
        <div className="mt-3">
          <AcceptRejectActions orderId={o.id} api={staffApi} onDone={load} canAccept={false} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Orders</h2>
        <p className="text-sm text-muted-foreground">
          {branches === null
            ? 'Loading…'
            : branches.length === 0
              ? 'Waiting for a branch invite'
              : branches.map((b) => b.name).join(' · ')}
        </p>
      </div>

      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {branches?.length === 0 && !error && (
        <p className="rounded-lg bg-amber-100/50 px-4 py-3 text-sm text-amber-700">
          You are not assigned to a branch yet. Ask the vendor to invite the email you signed up with from their
          Branches page, then refresh this page.
        </p>
      )}

      {multi && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by branch">
          {[{ id: 'all', name: 'All branches' }, ...(branches ?? [])].map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={filter === b.id}
              onClick={() => setFilter(b.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                filter === b.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {(branches?.length ?? 0) > 0 && active.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No active orders right now.</p>
      )}
      <div className="space-y-3">{active.map((o) => card(o, true))}</div>

      {finished.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recently finished</h3>
          {finished.map((o) => card(o, false))}
        </section>
      )}

    </div>
  );
}
