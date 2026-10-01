'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRiderOrders } from '@/lib/hooks/use-rider-orders';
import { isHistoryOrder } from '@/lib/rider';
import { RiderOrderCard } from '@/components/rider/RiderOrderCard';

export default function DeliveryHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isRider = user?.role === 'RIDER';

  // Delivery history only exists for riders.
  useEffect(() => {
    if (user && !isRider) router.replace('/dashboard');
  }, [user, isRider, router]);

  if (!isRider) return null;
  return <HistoryContent />;
}

function HistoryContent() {
  const { orders, loading, error } = useRiderOrders();

  const history = useMemo(
    () =>
      orders
        .filter(isHistoryOrder)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [orders]
  );
  const delivered = history.filter((o) => o.status === 'DELIVERED').length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Delivery history</h2>
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${delivered} delivered`}
        </p>
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

      {!loading && !error && history.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No past deliveries yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Completed and cancelled orders will appear here.</p>
        </div>
      )}

      <div className="space-y-4">
        {history.map((order) => (
          <RiderOrderCard key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
