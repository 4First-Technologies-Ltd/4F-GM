'use client';

import { useState } from 'react';
import { riderApi, RiderOrder } from '@/lib/api';
import { nextRiderAction } from '@/lib/rider';
import { Button } from '@/components/motion/button/base';
import { Modal } from '@/components/motion/modal';

/**
 * Moves an order one step forward (Start delivery → Mark as delivered) after a
 * confirmation. Renders nothing once the rider has no further action.
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

  if (!action) return null;

  async function confirm() {
    if (!action) return;
    setSubmitting(true);
    setError(null);
    try {
      await riderApi.updateOrderStatus(order.id, action.to);
      setOpen(false);
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

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={submitting} onClick={confirm}>
            {submitting ? 'Updating…' : 'Confirm'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
