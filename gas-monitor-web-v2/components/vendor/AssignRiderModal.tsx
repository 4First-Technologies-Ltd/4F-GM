'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { vendorApi, AssignableRider, VendorOrder } from '@/lib/api';
import { orderRef } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { Modal } from '@/components/motion/modal';

/**
 * Pick an approved rider for an order, or unassign the current one. Only ever
 * changes the rider — order status is untouched.
 */
export function AssignRiderModal({
  order,
  onClose,
  onAssigned
}: {
  /** The order being assigned; the modal is open while this is set. */
  order: VendorOrder | null;
  onClose: () => void;
  onAssigned: () => void | Promise<void>;
}) {
  const [riders, setRiders] = useState<AssignableRider[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderId = order?.id;
  const currentRiderId = order?.rider?.id ?? null;

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setRiders(null);
    setLoadError(null);
    setError(null);
    setSelected(currentRiderId);
    vendorApi
      .getRiders()
      .then((data) => {
        if (!cancelled) setRiders(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load riders.');
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, currentRiderId]);

  async function save(riderId: string | null) {
    if (!order) return;
    setSubmitting(true);
    setError(null);
    try {
      await vendorApi.assignRider(order.id, riderId);
      await onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the rider.');
    } finally {
      setSubmitting(false);
    }
  }

  const unchanged = selected === currentRiderId;

  return (
    <Modal
      open={order !== null}
      onClose={() => !submitting && onClose()}
      labelledBy="assign-rider-title"
      className="max-w-md"
    >
      <h2 id="assign-rider-title" className="text-lg font-semibold text-foreground">
        {currentRiderId ? 'Change rider' : 'Assign a rider'}
      </h2>
      {order && (
        <p className="mt-1 text-sm text-muted-foreground">
          Order <span className="font-mono">{orderRef(order)}</span> · {order.deliveryAddress}
        </p>
      )}

      <div className="mt-4">
        {!riders && !loadError && <p className="py-6 text-center text-sm text-muted-foreground">Loading riders…</p>}

        {loadError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{loadError}</div>
          </div>
        )}

        {riders && riders.length === 0 && (
          <p className="rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            No approved riders are available yet. Riders appear here once the 4FG team approves them.
          </p>
        )}

        {riders && riders.length > 0 && (
          <div role="radiogroup" aria-labelledby="assign-rider-title" className="max-h-72 space-y-2 overflow-y-auto">
            {riders.map((r) => {
              const checked = selected === r.id;
              return (
                <label
                  key={r.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                    checked ? 'border-primary bg-primary/[0.06]' : 'border-border hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="rider"
                    value={r.id}
                    checked={checked}
                    onChange={() => setSelected(r.id)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{r.user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[r.vehicleType, r.phone].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {currentRiderId ? (
          <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => save(null)}>
            Unassign
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={submitting || !selected || unchanged}
            onClick={() => save(selected)}
          >
            {submitting ? 'Saving…' : 'Assign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
