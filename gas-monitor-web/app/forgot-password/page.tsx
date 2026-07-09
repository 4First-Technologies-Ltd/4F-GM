'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  async function handleRequestCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email);
      setStep('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(email, otp, password);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResendMessage(null);
    setResending(true);
    try {
      await authApi.forgotPassword(email);
      setResendMessage('A new code is on its way.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>

          {step === 'email' && (
            <>
              <h1 className="auth-title">Forgot your password?</h1>
              <p className="auth-sub">Enter your email address and we&apos;ll send you a verification code.</p>

              <form onSubmit={handleRequestCode} noValidate>
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="form-error" role="alert" aria-live="polite">
                    {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                  {submitting ? 'Sending code…' : 'Send code'}
                </button>
              </form>

              <p className="auth-switch">
                Remembered your password? <Link href="/sign-in">Sign in</Link>
              </p>
            </>
          )}

          {step === 'reset' && (
            <>
              <h1 className="auth-title">Enter your code</h1>
              <p className="auth-sub">
                Enter the 6-digit code we sent to <strong>{email}</strong> and choose a new password.
              </p>

              <form onSubmit={handleReset} noValidate>
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
                <div className="field">
                  <label htmlFor="password">New password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <span className="field-help">At least 6 characters.</span>
                </div>
                <div className="field">
                  <label htmlFor="confirmPassword">Confirm new password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                  {submitting ? 'Updating…' : 'Update password'}
                </button>
              </form>

              <p className="auth-switch">
                Didn&apos;t get a code?{' '}
                <button type="button" className="otp-resend" onClick={handleResend} disabled={resending}>
                  {resending ? 'Sending…' : 'Resend code'}
                </button>
              </p>
            </>
          )}

          {step === 'done' && (
            <>
              <h1 className="auth-title">Password updated</h1>
              <p className="auth-sub">Your password has been changed. Sign in with your new password.</p>
              <button type="button" className="btn btn-primary btn-block" onClick={() => router.push('/sign-in')}>
                Go to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
