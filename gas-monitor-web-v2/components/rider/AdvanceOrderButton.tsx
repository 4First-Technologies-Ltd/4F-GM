'use client';

import { useState } from 'react';
import { riderApi, RiderOrder } from '@/lib/api';
import { nextRiderAction } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { Modal } from '@/components/motion/modal';

/**
 * Moves a job one step forward: picked up → delivered. Completing a delivery
 * needs the 4-digit PIN the customer gives the rider at the door. Renders
 * nothing once the rider has no further action.
 */
export function AdvanceOrderButton({
  order,
  onDone,
  size = 'md',
  className
}: {
  order: RiderOrder;
  onDone: () => void | Promise<void>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const action = nextRiderAction(order.status);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  if (!action) return null;
  const needsPin = action.to === 'DELIVERED';

  async function confirm() {
    if (!action) return;
    if (needsPin && !/^\d{4}$/.test(pin)) {
      setError('Enter the 4-digit PIN from the customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await riderApi.updateOrderStatus(order.id, action.to, needsPin ? pin : undefined);
      setOpen(false);
      setPin('');
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this order.');
    } finally {
      setSubmitting(false);
    }
  }

  const headingId = `advance-${order.id}`;

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size={size}
        className={className}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {action.label}
      </Button>

      <Modal open={open} onClose={() => !submitting && setOpen(false)} labelledBy={headingId}>
        <h2 id={headingId} className="text-lg font-semibold text-foreground">
          {action.confirmTitle}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{action.confirmBody}</p>

        {needsPin && (
          <div className="mt-4">
            <label htmlFor={`${headingId}-pin`} className="block text-sm font-medium text-foreground">
              Delivery PIN
            </label>
            <input
              id={`${headingId}-pin`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              className="mt-1 w-40 rounded-lg border border-border bg-background px-3 py-2 text-center font-mono text-2xl tracking-[0.5em] text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              aria-describedby={error ? `${headingId}-err` : undefined}
            />
          </div>
        )}

        {error && (
          <p id={`${headingId}-err`} className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={submitting} onClick={confirm}>
            {submitting ? 'Updating…' : needsPin ? 'Complete delivery' : 'Confirm'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
