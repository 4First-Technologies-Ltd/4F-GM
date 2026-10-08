'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { adminFetch } from '@/lib/api';
import { useAdminSession } from '@/lib/admin-session-context';

export default function AccountPage() {
  const router = useRouter();
  const { name, canChangePassword, mustChangePassword } = useAdminSession();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirm) {
      setError('New passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const res = await adminFetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not change password');
        return;
      }
      setDone(true);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      // The shell re-reads /auth/me on load; a full navigation clears the
      // "must change password" gate.
      if (mustChangePassword) window.location.assign('/dashboard');
      else router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Account</h1>
          <p className="adm-page-meta">Signed in as {name}</p>
        </div>
      </header>

      {mustChangePassword && (
        <p className="adm-field-help" role="alert">
          Your password was set by someone else. Choose your own before you continue.
        </p>
      )}

      {!canChangePassword ? (
        <p className="adm-page-meta">
          This is the shared environment login. Its password is set by <code>ADMIN_PASSWORD</code> on the server,
          not here. Create a named admin account to get your own password.
        </p>
      ) : (
        <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: 420 }}>
          <label className="adm-field">
            <span className="adm-field-label">Current password</span>
            <input className="adm-input" type="password" required autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">New password</span>
            <input className="adm-input" type="password" required minLength={8} autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
            <span className="adm-field-help">At least 8 characters. Other devices will be signed out.</span>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Confirm new password</span>
            <input className="adm-input" type="password" required minLength={8} autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          </label>
          {error && <p className="adm-field-error" role="alert">{error}</p>}
          {done && !mustChangePassword && <p className="adm-field-help" role="status">Password changed.</p>}
          <div>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
