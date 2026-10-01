'use client';

import Link from 'next/link';
import { MapPin, Navigation, Phone, Store, User } from 'lucide-react';
import type { RiderOrder } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { RIDER_STATUS_BADGE, RIDER_STATUS_LABEL, mapsUrl, nextRiderAction, orderRef, supplierLabel } from '@/lib/rider';
import { AdvanceOrderButton } from './AdvanceOrderButton';

export function RiderOrderCard({
  order,
  onChanged,
  showActions = false
}: {
  order: RiderOrder;
  onChanged?: () => void | Promise<void>;
  /** Show the next-step button and quick call/navigate links (active deliveries only). */
  showActions?: boolean;
}) {
  const hasAction = showActions && nextRiderAction(order.status) !== null;
  const date = new Date(order.updatedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/dashboard/deliveries/${order.id}`}
          className="font-mono text-sm font-semibold tracking-wide text-foreground hover:text-primary transition-colors"
        >
          {orderRef(order)}
        </Link>
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${RIDER_STATUS_BADGE[order.status]}`}
        >
          {RIDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-start gap-2.5">
          <Store className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd className="text-foreground">
            <span className="text-muted-foreground">Pick up from </span>
            <span className="font-medium">{supplierLabel(order)}</span>
          </dd>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd className="text-foreground">{order.deliveryAddress}</dd>
        </div>
        <div className="flex items-start gap-2.5">
          <User className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd className="text-foreground">{order.consumer.name}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs font-medium text-muted-foreground">
        <span>
          {order.quantity} × {order.cylinderSize}
        </span>
        <span>
          {formatNaira(order.totalAmount)} · {date}
        </span>
      </div>

      {hasAction && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <AdvanceOrderButton order={order} onDone={onChanged ?? (() => {})} className="flex-1 min-w-[10rem]" />
          <a
            href={mapsUrl(order.deliveryAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            Navigate
          </a>
          {order.consumer.phone && (
            <a
              href={`tel:${order.consumer.phone}`}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Call
            </a>
          )}
        </div>
      )}
    </div>
  );
}
