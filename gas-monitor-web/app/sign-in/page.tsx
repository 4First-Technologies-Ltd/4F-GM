'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api';
import PasswordInput from '@/components/PasswordInput';
import NetworkStatusDot from '@/components/NetworkStatusDot';

export default function SignInPage() {
  const { login, logout } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<'CONSUMER' | 'VENDOR'>('CONSUMER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role !== role) {
        await logout();
        setError(
          user.role === 'VENDOR'
            ? 'This account is registered as a Vendor. Switch to the Vendor tab to sign in.'
            : 'This account is registered as a Consumer. Switch to the Consumer tab to sign in.'
        );
        return;
      }
      if (user.role === 'VENDOR' && user.vendorStatus !== 'APPROVED') {
        router.push('/vendor-pending');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <NetworkStatusDot />
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to track cylinders, reminders, and orders.</p>

          <div className="role-tabs" role="group" aria-label="Sign in as">
            <button
              type="button"
              className={`role-tab${role === 'CONSUMER' ? ' is-active' : ''}`}
              onClick={() => setRole('CONSUMER')}
            >
              Consumer
            </button>
            <button
              type="button"
              className={`role-tab${role === 'VENDOR' ? ' is-active' : ''}`}
              onClick={() => setRole('VENDOR')}
            >
              Vendor
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
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
            <div className="field">
              <div className="field-label-row">
                <label htmlFor="password">Password</label>
                <Link href="/forgot-password" className="field-label-action">
                  Forgot password?
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="form-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-switch">
            Don&apos;t have an account? <Link href="/sign-up">Create one</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
