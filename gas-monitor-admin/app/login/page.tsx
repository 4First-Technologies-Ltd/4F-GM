'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api';
import { BrandMark } from '@/components/BrandMark';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once the password step passed and a second-factor code is still owed.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Surface the server's own message rather than a generic string.
        setError(body.error ?? 'Login failed');
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body.mfaRequired && body.challenge) {
        setChallenge(body.challenge);
        return;
      }
      router.replace('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminFetch('/auth/login/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, code: code.trim() })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === 'MFA_CHALLENGE_EXPIRED') {
          // The five-minute window passed; the password step has to be redone.
          setChallenge(null);
          setPassword('');
        }
        setError(body.error ?? 'Could not verify the code');
        setCode('');
        return;
      }
      router.replace('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  if (challenge) {
    return (
      <main className="adm-login">
        <div className="adm-login-card">
          <div className="adm-login-brand">
            <BrandMark className="adm-login-logo" />
            <div>
              <h1 className="adm-page-title">Two-step verification</h1>
              <p className="adm-page-meta">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
            </div>
          </div>
          <form onSubmit={handleCode} style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <label className="adm-field" htmlFor="code">
              <span className="adm-field-label">Code</span>
              <input
                id="code"
                className="adm-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                aria-describedby={error ? 'login-error' : undefined}
              />
            </label>
            {error && (
              <p id="login-error" className="adm-field-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="adm-btn adm-btn--primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              className="adm-btn"
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError(null);
              }}
            >
              Back
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="adm-login">
      <div className="adm-login-card">
        <div className="adm-login-brand">
          <BrandMark className="adm-login-logo" />
          <div>
            <h1 className="adm-page-title">4FG Admin</h1>
            <p className="adm-page-meta">Sign in to manage the gas monitor platform.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <label className="adm-field" htmlFor="username">
            <span className="adm-field-label">Username or email</span>
            <input
              id="username"
              className="adm-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label className="adm-field" htmlFor="password">
            <span className="adm-field-label">Password</span>
            <input
              id="password"
              className="adm-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-describedby={error ? 'login-error' : undefined}
            />
          </label>

          {error && (
            <p id="login-error" className="adm-field-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="adm-btn adm-btn--primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
