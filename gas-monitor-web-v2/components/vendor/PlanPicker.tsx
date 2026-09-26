'use client';

import { Check } from 'lucide-react';
import { PLAN_LIST, type VendorPlan } from '@/lib/plans';
import { cn } from '@/lib/utils';

/**
 * Radio group of partner plans. `value` is null until the vendor picks one —
 * there is no default, the commission rate has to be a deliberate choice.
 */
export function PlanPicker({
  value,
  onChange,
  disabled = false,
  disabledPlan,
}: {
  value: VendorPlan | null;
  onChange: (plan: VendorPlan) => void;
  disabled?: boolean;
  /** Plan to mark as the current one (used when switching, not at sign-up). */
  disabledPlan?: VendorPlan;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Partner plan"
      className={cn(
        'grid gap-3',
        PLAN_LIST.length > 1 && 'sm:grid-cols-3',
      )}
    >
      {PLAN_LIST.map((plan) => {
        const selected = value === plan.key;
        const isCurrent = disabledPlan === plan.key;

        return (
          <button
            key={plan.key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || isCurrent}
            onClick={() => onChange(plan.key)}
            className={cn(
              'relative rounded-xl border p-4 text-left transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-primary bg-primary/[0.06] ring-1 ring-primary'
                : 'border-border/70 hover:border-border hover:bg-muted/40',
            )}
          >
            {selected && (
              <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
            )}

            <span className="block text-sm font-semibold">{plan.name}</span>

            <span className="mt-1 block font-mono text-2xl font-semibold text-primary">
              {plan.commissionPercent}%
            </span>
            <span className="block text-xs text-muted-foreground">
              commission per completed order
            </span>

            <span className="mt-2 block text-xs text-muted-foreground">
              {isCurrent ? 'Your current plan' : plan.tagline}
            </span>
          </button>
        );
      })}
    </div>
  );
}
