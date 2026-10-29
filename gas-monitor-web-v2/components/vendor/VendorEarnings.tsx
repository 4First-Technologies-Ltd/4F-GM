'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Wallet } from 'lucide-react';
import { vendorApi, VendorEarningsResponse } from '@/lib/api';
import { formatNaira } from '@/lib/format';

const STATUS: Record<string, { text: string; className: string }> = {
  SETTLED: { text: 'Paid at checkout', className: 'bg-green-100/50 text-green-700' },
  PAID: { text: 'Paid out', className: 'bg-green-100/50 text-green-700' },
  IN_PAYOUT: { text: 'Payout on its way', className: 'bg-blue-100/50 text-blue-700' },
  AVAILABLE: { text: 'Awaiting payout', className: 'bg-amber-100/50 text-amber-700' }
};

/** Vendor earnings: what each delivered order paid after commission, and how it reaches the vendor's bank. */
export function VendorEarnings() {
  const [data, setData] = useState<VendorEarningsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    vendorApi
      .earnings()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your earnings.'));
  }, []);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Earnings</h2>
        <p className="text-sm text-muted-foreground">
          What each delivered order paid you after the platform commission. The delivery fee is not part of it.
        </p>
      </div>

      {data && !data.payoutAccount && (
        <div className="p-4 rounded-lg bg-amber-100/50 border border-amber-300/50 text-sm text-amber-800">
          You have not added a payout account yet, so we cannot pay you.{' '}
          <Link href="/dashboard/profile" className="font-semibold underline">
            Add your bank account
          </Link>
          .
        </div>
      )}
      {data?.payoutAccount && (
        <p className="text-sm text-muted-foreground">
          Paid to {data.payoutAccount.accountName} · {data.payoutAccount.bankName} ••••{data.payoutAccount.last4}
        </p>
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
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: 'Paid at checkout', value: data.totals.settled },
            { label: 'Paid out', value: data.totals.paidOut },
            { label: 'Awaiting payout', value: data.totals.awaitingPayout },
            { label: 'Commission taken', value: data.totals.commission }
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-xl font-bold text-foreground">{formatNaira(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {data && data.earnings.length === 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No earnings yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Earnings appear here once an order you fulfilled is delivered.
          </p>
        </div>
      )}

      {data && data.earnings.length > 0 && (
        <ul className="space-y-3">
          {data.earnings.map((e) => {
            const s = STATUS[e.status] ?? { text: e.status, className: 'bg-muted text-muted-foreground' };
            return (
              <li key={e.id} className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{formatNaira(e.netAmount)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatNaira(e.grossAmount)} gas − {formatNaira(e.commissionAmount)} commission ({e.commissionPercent}%)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.createdAt).toLocaleDateString()} · {e.order.cylinderSize} × {e.order.quantity}
                  </p>
                </div>
                <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${s.className}`}>{s.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
