'use client';

import { useEffect, useState } from 'react';
import { companyApi, type FleetDelivery } from '@/lib/api';
import {
  FLEET_STATUS_BADGE,
  FLEET_STATUS_LABEL,
  deliveryRef,
  isActiveDelivery,
  isFinishedDelivery
} from '@/lib/company';

/** Read-only view of what the fleet's riders are delivering. */
export function CompanyDeliveries() {
  const [orders, setOrders] = useState<FleetDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      companyApi
        .getDeliveries()
        .then((o) => {
          if (!cancelled) {
            setOrders(o);
            setError(null);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Could not load deliveries.');
            setOrders((o) => o ?? []);
          }
        });
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const active = orders?.filter(isActiveDelivery) ?? [];
  const finished = orders?.filter(isFinishedDelivery).slice(0, 30) ?? [];

  const card = (d: FleetDelivery) => (
    <div key={d.id} className="rounded-xl bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{deliveryRef(d)}</p>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${FLEET_STATUS_BADGE[d.status]}`}>
          {FLEET_STATUS_LABEL[d.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground">
        {d.quantity} × {d.cylinderSize}
        {d.vendor ? ` · ${d.vendor.businessName}` : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {d.rider ? `Rider: ${d.rider.user.name}` : 'No rider'} · for {d.consumer.name}
      </p>
      <p className="text-xs text-muted-foreground">{d.deliveryAddress}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Deliveries</h2>
        <p className="text-sm text-muted-foreground">What your riders are delivering. Updates every 30 seconds.</p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {orders === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {orders && active.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No active deliveries right now.</p>
      )}

      <div className="space-y-2">{active.map(card)}</div>

      {finished.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recently finished</h3>
          {finished.map(card)}
        </section>
      )}
    </div>
  );
}
