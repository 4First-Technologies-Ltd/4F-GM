'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { ButtonLink } from '@/components/motion/button/base';
import { LogoEmblem } from '@/components/site/Logo';
import { isVendorPlan, PLANS } from '@/lib/plans';

export default function VendorPendingPage() {
  return (
    <Suspense fallback={null}>
      <VendorPendingContent />
    </Suspense>
  );
}

function VendorPendingContent() {
  const planParam = useSearchParams().get('plan');
  const plan = isVendorPlan(planParam) ? PLANS[planParam] : null;

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <Link
          href="/"
          className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity"
        >
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
        </Link>

        <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </span>

        <h1 className="mt-4 text-2xl font-bold text-foreground">Application received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We review every vendor before they go live on the marketplace — licensing, safety record
          and business details. You&apos;ll get an email as soon as a decision is made.
        </p>

        {plan && (
          <div className="mt-6 rounded-xl border border-border/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Platform commission
            </p>
            <p className="mt-1 text-sm font-medium">
              <span className="font-mono text-primary">{plan.commissionPercent}%</span> per
              completed order
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              There is no fee for being listed — 4FG earns only on orders completed through the
              marketplace.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/dashboard" size="lg">
            Go to dashboard
          </ButtonLink>
          <ButtonLink href="/" variant="outline" size="lg">
            Back to site
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
