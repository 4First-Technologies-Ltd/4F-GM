'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, ApiRequestError } from '@/lib/api';
import { Button, ButtonLink } from '@/components/motion/button/base';
import { LogoEmblem } from '@/components/site/Logo';
import { isVendorPlan, PLANS, type VendorPlan } from '@/lib/plans';

const PENDING_VENDOR_KEY = '4fg_pending_vendor_profile';

type PendingVendor = {
  businessName: string;
  businessAddress: string;
  phone: string;
  plan: VendorPlan;
};

/**
 * Reads the vendor details stashed by the sign-up form. Returns null if the
 * payload is missing or malformed — the profile is then created from the
 * dashboard rather than blocking verification.
 */
function readPendingVendor(): PendingVendor | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(PENDING_VENDOR_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingVendor>;
    if (
      !parsed.businessName ||
      !parsed.businessAddress ||
      !parsed.phone ||
      !isVendorPlan(parsed.plan)
    ) {
      return null;
    }
    return parsed as PendingVendor;
  } catch {
    return null;
  }
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyOtp, resendOtp } = useAuth();

  const email = searchParams.get('email') ?? '';
  const role = searchParams.get('role');

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyOtp(email, otp);

      if (role === 'VENDOR') {
        const pending = readPendingVendor();
        if (pending) {
          window.sessionStorage.removeItem(PENDING_VENDOR_KEY);
          await vendorApi.createProfile(pending);
          router.push(`/vendor-pending?plan=${pending.plan}`);
          return;
        }
        // Verified, but the business details were lost (new tab, cleared
        // storage). The account exists — finish the profile from the dashboard.
        router.push('/dashboard/profile');
        return;
      }

      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'OTP_EXPIRED') {
        setError('This code has expired. Send a new one below.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    setResending(true);
    try {
      await resendOtp(email, 'SIGNUP_VERIFICATION');
      setResendMessage('A new code is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <LogoEmblem size={40} />
            <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground mb-2">Missing email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            We couldn&apos;t tell which account to verify. Try signing up again.
          </p>
          <ButtonLink href="/sign-up" size="lg" className="w-full">
            Back to sign up
          </ButtonLink>
        </div>
      </main>
    );
  }

  const pendingPlan = typeof window !== 'undefined' ? readPendingVendor()?.plan : null;

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
        </Link>

        <h1 className="text-2xl font-bold text-foreground mb-2">Verify your email</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter the 6-digit code we sent to <strong className="text-foreground">{email}</strong>. It
          expires in 10 minutes.
        </p>

        {role === 'VENDOR' && pendingPlan && (
          <p className="mb-6 rounded-xl bg-primary/[0.06] px-4 py-3 text-sm text-muted-foreground">
            Your application will be submitted on the{' '}
            <span className="font-medium text-foreground">
              {PLANS[pendingPlan].name} plan ({PLANS[pendingPlan].commissionPercent}%)
            </span>
            .
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="otp" className="mb-1.5 block text-sm font-medium">
              Verification code
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg border border-input bg-card px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {error}
            </p>
          )}
          {resendMessage && (
            <p className="text-sm text-primary" role="status" aria-live="polite">
              {resendMessage}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={submitting || otp.length !== 6}
          >
            {submitting ? 'Verifying…' : 'Verify email'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Didn&apos;t get it?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        </p>
      </div>
    </main>
  );
}
