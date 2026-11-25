'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/motion/button/base';
import { Modal } from '@/components/motion/modal';

type OrderApi = {
  acceptOrder: (id: string) => Promise<void>;
  rejectOrder: (id: string, reason?: string) => Promise<void>;
};

/**
 * Accept a paid order (it goes to the rider job pool) or reject it (it is
 * cancelled and 4FG refunds the customer). Vendors and branch managers no
 * longer pick riders: riders choose their own jobs.
 */
export function AcceptRejectActions({
  orderId,
  api,
  onDone,
  canAccept = true
}: {
  orderId: string;
  api: OrderApi;
  onDone: () => void | Promise<void>;
  /** False once accepted: the order can still be rejected until a rider picks it up. */
  canAccept?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRejecting(false);
      setReason('');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the order.');
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  const headingId = `reject-${orderId}`;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {canAccept && (
          <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => run(() => api.acceptOrder(orderId))}>
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Accepting…' : 'Accept'}
            </span>
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
          <span className="flex items-center gap-1.5 text-destructive">
            <X className="h-4 w-4" aria-hidden="true" />
            Reject
          </span>
        </Button>
      </div>
      {error && !rejecting && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <Modal open={rejecting} onClose={() => !busy && setRejecting(false)} labelledBy={headingId}>
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          Reject this order?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The customer has already paid. The order will be cancelled and the 4FG team will refund them.
        </p>
        <label className="mt-4 block text-sm font-medium text-foreground" htmlFor={`${headingId}-reason`}>
          Reason (shown to the customer)
        </label>
        <textarea
          id={`${headingId}-reason`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="e.g. We're out of 12.5 kg cylinders today"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
            Keep order
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => run(() => api.rejectOrder(orderId, reason.trim() || undefined))}
          >
            {busy ? 'Rejecting…' : 'Reject order'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
