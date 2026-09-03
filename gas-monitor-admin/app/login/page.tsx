'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api';
import { IconDiamond } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      router.replace('/dashboard');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="adm-login">
      <div className="adm-login-card">
        <div className="adm-login-brand">
          <IconDiamond className="adm-login-logo" />
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
