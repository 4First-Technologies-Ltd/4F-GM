'use client';

import { useMemo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRiderOrders } from '@/lib/hooks/use-rider-orders';
import { isActiveOrder } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { RiderOrderCard } from './RiderOrderCard';
import { JobPool } from './JobPool';

/** Rider home: the job they are doing now, the online switch and the job pool. */
export function RiderDeliveries() {
  const { user } = useAuth();
  const { orders, loading, refreshing, error, refresh, reload } = useRiderOrders({ poll: true });

  // Out-for-delivery first (already in progress), then oldest first.
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
          <h2 className="text-2xl font-bold text-foreground mb-1">Hi, {user?.name.split(' ')[0] ?? 'there'}</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading your jobs…'
              : active.length > 0
                ? 'Your current job is below.'
                : 'Go online, then take a job from the list.'}
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

      {active.length > 0 && (
        <section className="space-y-4" aria-label="Current job">
          {active.map((order) => (
            <RiderOrderCard key={order.id} order={order} showActions onChanged={reload} />
          ))}
        </section>
      )}

      {!loading && <JobPool hasActiveJob={active.length > 0} onTaken={reload} />}
    </div>
  );
}
