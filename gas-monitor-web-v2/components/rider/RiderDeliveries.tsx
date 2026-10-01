'use client';

import { useMemo } from 'react';
import { AlertCircle, PackageOpen, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRiderOrders } from '@/lib/hooks/use-rider-orders';
import { isActiveOrder } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { RiderOrderCard } from './RiderOrderCard';

/** Rider home: orders still needing action. Polls every 30s. */
export function RiderDeliveries() {
  const { user } = useAuth();
  const { orders, loading, refreshing, error, refresh, reload } = useRiderOrders({ poll: true });

  // Out-for-delivery first (already in progress), then oldest assignment first.
  const active = useMemo(
    () =>
      orders.filter(isActiveOrder).sort((a, b) => {
        if (a.status !== b.status) return a.status === 'OUT_FOR_DELIVERY' ? -1 : 1;
        return new Date(a.assignedAt ?? a.createdAt).getTime() - new Date(b.assignedAt ?? b.createdAt).getTime();
      }),
    [orders]
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Hi, {user?.name.split(' ')[0] ?? 'there'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading your deliveries…'
              : `${active.length} active ${active.length === 1 ? 'delivery' : 'deliveries'}. New assignments appear automatically.`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={refreshing || loading}>
          <span className="flex items-center gap-2">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </span>
        </Button>
      </div>

      {error && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && active.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <PackageOpen className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No active deliveries</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders assigned to you by a vendor will show up here.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {active.map((order) => (
          <RiderOrderCard key={order.id} order={order} showActions onChanged={reload} />
        ))}
      </div>
    </div>
  );
}
