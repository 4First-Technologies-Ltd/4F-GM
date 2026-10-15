'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bike, UserPlus } from 'lucide-react';
import { staffApi, type ManagerOrder, type StaffBranch } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { RIDER_STATUS_BADGE, RIDER_STATUS_LABEL, orderRef } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { AssignRiderModal } from '@/components/vendor/AssignRiderModal';

type Next = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

/** Unpaid (PENDING) orders never appear: payment confirms them, not a manager. */
const isActive = (o: ManagerOrder) => o.status === 'CONFIRMED' || o.status === 'OUT_FOR_DELIVERY';
const isFinished = (o: ManagerOrder) => o.status === 'DELIVERED' || o.status === 'CANCELLED';

/**
 * A branch manager's orders: the branches they were invited to, nothing else.
 * Moves are forward-only and the server enforces them.
 */
export function ManagerOrders() {
  const [branches, setBranches] = useState<StaffBranch[] | null>(null);
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<ManagerOrder | null>(null);
  // Armed action: the first click selects it, the second confirms.
  const [pending, setPending] = useState<{ id: string; to: Next } | null>(null);

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

  async function advance(order: ManagerOrder, to: Next) {
    setBusyId(order.id);
    setError(null);
    try {
      await staffApi.updateOrderStatus(order.id, to);
      setPending(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order.');
      setPending(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const visible = useMemo(
    () => orders.filter((o) => o.status !== 'PENDING' && (filter === 'all' || o.branch?.id === filter)),
    [orders, filter]
  );
  const active = visible.filter(isActive);
  const finished = visible.filter(isFinished).slice(0, 20);
  const multi = (branches?.length ?? 0) > 1;

  const actionButton = (o: ManagerOrder, to: Next, label: string, danger = false) => {
    const armed = pending?.id === o.id && pending.to === to;
    return armed ? (
      <span key={to} className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busyId === o.id} onClick={() => advance(o, to)}>
          Confirm: {label.toLowerCase()}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setPending(null)}
        >
          Cancel
        </button>
      </span>
    ) : (
      <button
        key={to}
        type="button"
        disabled={busyId === o.id}
        onClick={() => setPending({ id: o.id, to })}
        className={`text-sm font-medium ${danger ? 'text-destructive hover:text-destructive/80' : 'text-primary hover:text-primary/80'}`}
      >
        {label}
      </button>
    );
  };

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
        withActions && <p className="mt-1 text-xs text-amber-700">No rider assigned</p>
      )}

      {withActions && (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
            onClick={() => setAssigning(o)}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {o.rider ? 'Change rider' : 'Assign rider'}
          </button>
          {o.status === 'CONFIRMED' && actionButton(o, 'OUT_FOR_DELIVERY', 'Start delivery')}
          {actionButton(o, 'DELIVERED', 'Mark delivered')}
          {actionButton(o, 'CANCELLED', 'Cancel order', true)}
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

      <AssignRiderModal
        order={assigning}
        api={staffApi}
        onClose={() => setAssigning(null)}
        onAssigned={load}
      />
    </div>
  );
}
