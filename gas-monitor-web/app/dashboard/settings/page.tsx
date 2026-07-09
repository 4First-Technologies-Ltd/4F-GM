'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getPreferences, savePreferences, UserPreferences } from '@/lib/storage';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(getPreferences());
  }, []);

  function updatePref(key: keyof UserPreferences, value: boolean) {
    setPrefs((current) => {
      const next = { ...(current ?? getPreferences()), [key]: value };
      savePreferences(next);
      setSaved(true);
      return next;
    });
  }

  if (!user || !prefs) return null;

  return (
    <div className="settings-page">
      <section className="card settings-section">
        <h2>Profile</h2>
        <p className="hero-card-sub">
          These details come from your account. Editing profile info isn&apos;t available yet — contact support if
          something needs to change.
        </p>
        <dl className="account-list">
          <div>
            <dt>Full name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email address</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>{user.role === 'VENDOR' ? 'Vendor' : 'Consumer'}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>

      <section className="card settings-section">
        <h2>Notifications</h2>
        <p className="hero-card-sub">Saved on this device only — not yet synced to your account.</p>

        <div className="settings-row">
          <div>
            <strong>Email notifications</strong>
            <p className="hero-card-sub">Refill reminders and order updates by email.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.emailNotifications}
              onChange={(e) => updatePref('emailNotifications', e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="sr-only">Email notifications</span>
          </label>
        </div>

        <div className="settings-row">
          <div>
            <strong>SMS alerts</strong>
            <p className="hero-card-sub">Text message alerts for critical gas level changes.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={prefs.smsAlerts}
              onChange={(e) => updatePref('smsAlerts', e.target.checked)}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="sr-only">SMS alerts</span>
          </label>
        </div>

        {saved && (
          <p className="form-hint" aria-live="polite">
            Saved.
          </p>
        )}
      </section>

      <section className="card settings-section settings-danger">
        <h2>Session</h2>
        <p className="hero-card-sub">Sign out of 4FG Smart Gas Monitor on this device.</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
