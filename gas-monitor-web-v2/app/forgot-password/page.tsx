'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { Eye, EyeOff } from 'lucide-react';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-card p-8 shadow-lg">
          {/* Brand Header */}
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold text-primary">4F</span>
            <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
          </Link>

          {step === 'email' && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">Forgot your password?</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email address and we&apos;ll send you a verification code.
              </p>

              <form onSubmit={handleRequestCode} noValidate className="space-y-4">
                <Input
                  label="Email address"
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={setEmail}
                  error={false}
                  placeholder="you@example.com"
                  classNames={{ root: 'w-full' }}
                />

                {error && (
                  <div
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"
                    role="alert"
                    aria-live="polite"
                  >
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={submitting}
                  className="w-full font-semibold"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Sending code…
                    </span>
                  ) : (
                    'Send code'
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Remembered your password?{' '}
                <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}

          {step === 'reset' && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">Enter your code</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Enter the 6-digit code we sent to <strong>{email}</strong> and choose a new password.
              </p>

              <form onSubmit={handleReset} noValidate className="space-y-4">
                <Input
                  label="Verification code"
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(val) => setOtp(val.replace(/\D/g, '').slice(0, 6))}
                  error={false}
                  placeholder="000000"
                  classNames={{ root: 'w-full text-center tracking-widest text-2xl font-bold' }}
                />

                <div>
                  <Input
                    label="New password"
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={password}
                    onChange={setPassword}
                    error={false}
                    placeholder="••••••••"
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="flex items-center justify-center h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                    classNames={{ root: 'w-full' }}
                  />
                  <p className="text-xs text-muted-foreground mt-2">At least 6 characters.</p>
                </div>

                <div>
                  <Input
                    label="Confirm new password"
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    error={false}
                    placeholder="••••••••"
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="flex items-center justify-center h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                    classNames={{ root: 'w-full' }}
                  />
                </div>

                {error && (
                  <div
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"
                    role="alert"
                    aria-live="polite"
                  >
                    {error}
                  </div>
                )}
                {resendMessage && (
                  <div
                    className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700"
                    role="status"
                    aria-live="polite"
                  >
                    {resendMessage}
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={submitting || otp.length !== 6}
                  className="w-full font-semibold"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Updating…
                    </span>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                Didn&apos;t get a code?{' '}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-50"
                >
                  {resending ? 'Sending…' : 'Resend code'}
                </button>
              </p>
            </>
          )}

          {step === 'done' && (
            <>
              <h1 className="text-2xl font-bold text-foreground mb-2">Password updated</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Your password has been changed. Sign in with your new password.
              </p>
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => router.push('/sign-in')}
                className="w-full font-semibold"
              >
                Go to sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
