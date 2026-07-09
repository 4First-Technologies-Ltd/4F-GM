'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function SignUpPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<'CONSUMER' | 'VENDOR' | null>(null);
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
    if (next === 'VENDOR') {
      router.push('/vendor-sign-up');
      return;
    }
    setRole('CONSUMER');
  }

  return (
    <main className="auth-page">
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>

          {role === null ? (
            <>
              <h1 className="auth-title">Create your account</h1>
              <p className="auth-sub">Tell us how you&apos;ll use 4FG Smart Gas Monitor.</p>

              <div className="role-picker" role="group" aria-label="Choose account type">
                <button type="button" className="role-card" onClick={() => chooseRole('CONSUMER')}>
                  <span className="role-card-title">I&apos;m a customer</span>
                  <span className="role-card-sub">Monitor cylinders and order refills from trusted vendors.</span>
                </button>
                <button type="button" className="role-card" onClick={() => chooseRole('VENDOR')}>
                  <span className="role-card-title">I&apos;m a vendor</span>
                  <span className="role-card-sub">List gas products and manage incoming orders.</span>
                </button>
              </div>

              <p className="auth-switch">
                Already have an account? <Link href="/sign-in">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="auth-title">Create your account</h1>
              <p className="auth-sub">Monitor cylinders and order refills from trusted vendors.</p>

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
                <button type="button" className="link-underline" onClick={() => setRole(null)}>
                  ← Back
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
