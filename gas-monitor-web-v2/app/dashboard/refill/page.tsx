'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { monitorApi, type ReorderSuggestion } from '@/lib/api';
import { formatNaira } from '@/lib/format';

/** Where a low-gas alert leads: the monitor's cylinder size and who sells it. */
function Refill() {
  const deviceId = useSearchParams().get('deviceId');
  const [data, setData] = useState<ReorderSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    monitorApi
      .reorder(deviceId)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Could not load suggestions.'));
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const browse = (
    <Link href="/marketplace" className="text-sm font-medium text-primary underline">
      Browse all suppliers
    </Link>
  );

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground mb-1">Order a refill</h1>
      {!deviceId ? (
        <p className="text-sm text-muted-foreground">Choose a monitor to see matching suppliers. {browse}</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.needsCylinder || data.sizeKg == null ? (
        <p className="text-sm text-muted-foreground">Set which cylinder your monitor is on, and we will suggest matching suppliers. {browse}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">Suppliers that sell your {data.sizeKg} kg cylinder. Prices include delivery.</p>
          {data.hasOpenOrder && (
            <p className="mb-4 rounded-xl bg-muted/50 p-4 text-sm text-foreground">
              A refill is already on the way. You have a paid order that has not been delivered yet.
            </p>
          )}
          {data.options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supplier lists this size right now. {browse}</p>
          ) : (
            <ul className="space-y-3">
              {data.options.map((o) => (
                <li key={o.listingId} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {o.vendorName}
                      {o.branchName ? ` · ${o.branchName}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{o.previous ? 'You have ordered here before' : (o.city ?? 'Available now')}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-semibold text-foreground">{formatNaira(o.total)}</span>
                    <Link
                      href={`/checkout?item=${encodeURIComponent(o.listingId)}&size=${encodeURIComponent(o.cylinderSize)}`}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      Order
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default function RefillPage() {
  return (
    <Suspense fallback={null}>
      <Refill />
    </Suspense>
  );
}
