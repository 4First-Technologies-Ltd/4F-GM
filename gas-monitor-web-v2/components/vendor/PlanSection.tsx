'use client';

import { useState } from 'react';
import { AlertCircle, Lock } from 'lucide-react';
import { Button } from '@/components/motion/button/base';
import { PlanPicker } from '@/components/vendor/PlanPicker';
import { vendorApi, ApiRequestError, type VendorProfile } from '@/lib/api';
import {
  daysRemaining,
  PLAN_COOLDOWN_DAYS,
  PLANS,
  type VendorPlan,
} from '@/lib/plans';

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Current partner plan plus the switch flow. A switch applies immediately and
 * locks further changes for the cooldown window, so it asks for confirmation
 * before sending.
 */
export function PlanSection({
  profile,
  onUpdated,
}: {
  profile: VendorProfile;
  onUpdated: (profile: VendorProfile) => void;
}) {
  const [choice, setChoice] = useState<VendorPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const current = PLANS[profile.plan];
  const lockedDays = daysRemaining(profile.planLockedUntil);
  const locked = lockedDays > 0;

  async function handleSwitch() {
    if (!choice) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await vendorApi.changePlan(choice);
      onUpdated(updated);
      setDone(`You're now on the ${PLANS[choice].name} plan.`);
      setChoice(null);
      setOpen(false);
    } catch (err) {
      // The server owns the cooldown: it can reject even when this UI thought
      // the lock had expired (clock skew, another tab).
      if (err instanceof ApiRequestError && err.code === 'PLAN_LOCKED') {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not change your plan.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-semibold text-foreground">Partner plan</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        4FG earns a commission only on orders completed through the marketplace.
      </p>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-3xl font-semibold text-primary">
          {current.commissionPercent}%
        </span>
        <span className="text-sm font-medium text-foreground">{current.name} plan</span>
        {profile.planChangedAt && (
          <span className="text-xs text-muted-foreground">
            since {formatDate(profile.planChangedAt)}
          </span>
        )}
      </div>

      {locked && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            You can change plan again in {lockedDays} day{lockedDays === 1 ? '' : 's'}
            {profile.planLockedUntil ? ` (${formatDate(profile.planLockedUntil)})` : ''}.
          </span>
        </p>
      )}

      {done && (
        <p className="mt-4 text-sm text-primary" role="status" aria-live="polite">
          {done}
        </p>
      )}

      {!open && !locked && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => {
            setOpen(true);
            setDone(null);
          }}
        >
          Change plan
        </Button>
      )}

      {open && (
        <div className="mt-5 space-y-4">
          <PlanPicker
            value={choice}
            onChange={setChoice}
            disabled={submitting}
            disabledPlan={profile.plan}
          />

          <p className="text-xs text-muted-foreground">
            The new rate applies to orders completed from the moment you switch. You&apos;ll then
            be held on that plan for {PLAN_COOLDOWN_DAYS} days.
          </p>

          {error && (
            <p
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!choice || submitting}
              onClick={handleSwitch}
            >
              {submitting
                ? 'Switching…'
                : choice
                  ? `Switch to ${PLANS[choice].commissionPercent}% — hold ${PLAN_COOLDOWN_DAYS} days`
                  : 'Select a plan'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => {
                setOpen(false);
                setChoice(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
