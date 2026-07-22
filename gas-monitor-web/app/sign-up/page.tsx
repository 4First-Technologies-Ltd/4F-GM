'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import PasswordInput from '@/components/PasswordInput';
import NetworkStatusDot from '@/components/NetworkStatusDot';

export default function SignUpPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await register(name, email, password, 'CONSUMER');
      router.push(`/verify-email?email=${encodeURIComponent(result.email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function chooseRole(next: 'CONSUMER' | 'VENDOR') {
    if (next === 'VENDOR') router.push('/vendor-sign-up');
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

          <h1 className="auth-title">Create your account</h1>
          <p className="auth-sub">Monitor cylinders and order refills from trusted vendors.</p>

          <div className="role-tabs" role="group" aria-label="Choose account type">
            <button type="button" className="role-tab is-active" onClick={() => chooseRole('CONSUMER')}>
              Consumer
            </button>
            <button type="button" className="role-tab" onClick={() => chooseRole('VENDOR')}>
              Vendor
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
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
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="field-help">At least 6 characters.</span>
            </div>

            {error && (
              <p className="form-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
