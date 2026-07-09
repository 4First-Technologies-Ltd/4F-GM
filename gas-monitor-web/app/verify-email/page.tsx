'use client';

import { Suspense, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, ApiRequestError } from '@/lib/api';

const PENDING_VENDOR_KEY = '4fg_pending_vendor_profile';

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
        const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(PENDING_VENDOR_KEY) : null;
        if (raw) {
          const pending = JSON.parse(raw) as { businessName: string; businessAddress: string; phone: string };
          window.sessionStorage.removeItem(PENDING_VENDOR_KEY);
          await vendorApi.createProfile(pending);
        }
        router.push('/vendor-pending');
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
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <main className="auth-page">
        <div className="container auth-container">
          <div className="card auth-card">
            <a className="brand" href="/">
              <span className="brand-mark">4F</span>
              <span>4FG Smart Gas Monitor</span>
            </a>
            <h1 className="auth-title">Missing email</h1>
            <p className="auth-sub">We couldn&apos;t tell which account to verify. Try signing up again.</p>
            <Link href="/sign-up" className="btn btn-primary btn-block">
              Back to sign up
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <h1 className="auth-title">Verify your email</h1>
          <p className="auth-sub">
            Enter the 6-digit code we sent to <strong>{email}</strong>. It expires in 10 minutes.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="otp">Verification code</label>
              <input
                id="otp"
                className="otp-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>

            {error && (
              <p className="form-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}
            {resendMessage && (
              <p className="form-success" role="status" aria-live="polite">
                {resendMessage}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting || otp.length !== 6}>
              {submitting ? 'Verifying…' : 'Verify email'}
            </button>
          </form>

          <p className="auth-switch">
            Didn&apos;t get a code?{' '}
            <button type="button" className="otp-resend" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend code'}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
