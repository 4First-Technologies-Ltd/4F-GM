'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Navigation, Phone, Store, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { riderApi, RiderOrder } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { RIDER_STATUS_BADGE, RIDER_STATUS_LABEL, mapsUrl, orderRef, supplierLabel } from '@/lib/rider';
import { AdvanceOrderButton } from '@/components/rider/AdvanceOrderButton';

export default function DeliveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const isRider = user?.role === 'RIDER';

  useEffect(() => {
    if (user && !isRider) router.replace('/dashboard');
  }, [user, isRider, router]);

  if (!isRider) return null;
  return <DeliveryDetail id={id} />;
}

function ContactCard({
  icon: Icon,
  title,
  name,
  detail,
  phone,
  mapAddress
}: {
  icon: typeof Store;
  title: string;
  name: string;
  detail?: string | null;
  phone?: string | null;
  mapAddress?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 flex items-start gap-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{name}</p>
          {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {(phone || mapAddress) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {mapAddress && (
            <a
              href={mapsUrl(mapAddress)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              Navigate
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {phone}
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function DeliveryDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<RiderOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // The API has no single-order rider endpoint; the assigned list is small.
      const orders = await riderApi.getOrders();
      const found = orders.find((o) => o.id === id) ?? null;
      setOrder(found);
      setError(found ? null : 'This order is no longer assigned to you.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this order.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to deliveries
      </Link>

      {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading order…</p>}

      {!loading && !order && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{error ?? 'Order not found.'}</div>
        </div>
      )}

      {order && (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-mono text-2xl font-bold tracking-wide text-foreground">{orderRef(order)}</h2>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${RIDER_STATUS_BADGE[order.status]}`}
            >
              {RIDER_STATUS_LABEL[order.status]}
            </span>
          </div>

          <ContactCard
            icon={Store}
            title="Pick up from"
            name={supplierLabel(order)}
            detail={order.vendor?.businessAddress}
            phone={order.vendor?.phone}
            mapAddress={order.vendor?.businessAddress}
          />

          <ContactCard
            icon={User}
            title="Deliver to"
            name={order.consumer.name}
            detail={order.deliveryAddress}
            phone={order.consumer.phone}
            mapAddress={order.deliveryAddress}
          />

          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Cylinder</dt>
                <dd className="font-medium text-foreground">{order.cylinderSize}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="font-medium text-foreground">{order.quantity}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="font-medium text-foreground">{formatNaira(order.totalAmount)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Paid online — no cash to collect.</p>
          </section>

          <AdvanceOrderButton order={order} onDone={load} size="lg" className="w-full" />
        </>
      )}
    </div>
  );
}
