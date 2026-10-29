'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { bankApi, riderApi, RiderEarningsResponse } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { VendorEarnings } from '@/components/vendor/VendorEarnings';

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  PAID: { text: 'Paid', className: 'bg-green-100/50 text-green-700' },
  PROCESSING: { text: 'On its way', className: 'bg-blue-100/50 text-blue-700' },
  PENDING: { text: 'Waiting to be sent', className: 'bg-amber-100/50 text-amber-700' },
  FAILED: { text: 'Will be retried', className: 'bg-amber-100/50 text-amber-700' }
};

export default function EarningsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isRider = user?.role === 'RIDER';
  const isVendor = user?.role === 'VENDOR';

  // Earnings exist for riders (delivery pay) and vendors (order earnings) only.
  useEffect(() => {
    if (user && !isRider && !isVendor) router.replace('/dashboard');
  }, [user, isRider, isVendor, router]);

  if (isVendor) return <VendorEarnings />;
  if (!isRider) return null;
  return <EarningsContent />;
}

function EarningsContent() {
  const [data, setData] = useState<RiderEarningsResponse | null>(null);
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    riderApi
      .earnings()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your earnings.'));
    bankApi
      .getAccount()
      .then((a) => setHasAccount(!!a))
      .catch(() => setHasAccount(null));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Earnings</h2>
        <p className="text-sm text-muted-foreground">
          Your share of the delivery fee on each order you deliver, paid to your bank account.
        </p>
      </div>

      {hasAccount === false && (
        <div className="p-4 rounded-lg bg-amber-100/50 border border-amber-300/50 text-sm text-amber-800">
          You have not added a bank account yet, so we cannot pay you.{' '}
          <Link href="/dashboard/profile" className="font-semibold underline">
            Add your bank account
          </Link>
          . Anything waiting is sent once you do.
        </div>
      )}

      {error && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">Paid to you</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatNaira(data.totals.paid)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs text-muted-foreground">On its way</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{formatNaira(data.totals.pending)}</p>
          </div>
        </div>
      )}

      {data && data.earnings.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No earnings yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You earn a share of the delivery fee each time you mark an order delivered.
          </p>
        </div>
      )}

      {data && data.earnings.length > 0 && (
        <ul className="space-y-3">
          {data.earnings.map((e) => {
            const s = STATUS_LABEL[e.status] ?? { text: e.status, className: 'bg-muted text-muted-foreground' };
            return (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{formatNaira(e.amount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.paidAt ?? e.createdAt).toLocaleDateString()} · Order {e.orderId.slice(0, 8)}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${s.className}`}>{s.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
