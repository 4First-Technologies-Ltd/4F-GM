'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import type { UpdateProfilePayload } from '@/lib/api';
import { Button } from '@/components/motion/button/base';
import { AlertCircle, Check } from 'lucide-react';

type PrefKey = 'pushEnabled' | 'emailNotifEnabled' | 'smsAlertsEnabled';

const TOGGLES: { key: PrefKey; title: string; description: string }[] = [
  { key: 'pushEnabled', title: 'Push notifications', description: 'Order updates and refill reminders on your device.' },
  { key: 'emailNotifEnabled', title: 'Email notifications', description: 'Refill reminders and order updates by email.' },
  { key: 'smsAlertsEnabled', title: 'SMS alerts', description: 'Text message alerts for critical gas level changes.' }
];

function Switch({
  checked,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { user, logout, updateProfile } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // `user` is the source of truth: the controls read straight from it, so a failed
  // save leaves them showing the last value the server accepted.
  async function save(patch: UpdateProfilePayload) {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile(patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your preferences.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await logout();
    router.push('/');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">Notifications</h2>
        <p className="text-sm text-muted-foreground mb-6">Synced to your account across web and mobile.</p>

        <div className="divide-y divide-border -my-4">
          {TOGGLES.map((t) => (
            <div key={t.key} className="py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-foreground">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.description}</p>
              </div>
              <Switch
                label={t.title}
                checked={user[t.key]}
                disabled={saving}
                onChange={(next) => save({ [t.key]: next })}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <label htmlFor="unit" className="block text-sm font-medium text-foreground mb-2">
            Measurement units
          </label>
          <select
            id="unit"
            value={user.unitPreference}
            disabled={saving}
            onChange={(e) => save({ unitPreference: e.target.value as 'KG' | 'LBS' })}
            className="w-full sm:w-64 px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
          >
            <option value="KG">Kilograms (kg)</option>
            <option value="LBS">Pounds (lbs)</option>
          </select>
        </div>

        <div className="mt-4 min-h-5" aria-live="polite">
          {saved && (
            <span className="flex items-center gap-2 text-xs text-green-700 font-medium">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
          {error && (
            <div className="text-sm text-destructive flex items-start gap-2" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">Session</h2>
        <p className="text-sm text-muted-foreground mb-4">Sign out of 4FG Smart Gas Monitor on this device.</p>
        <Button type="button" variant="outline" size="sm" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your name, phone number and business details live under{' '}
        <Link href="/dashboard/profile" className="underline underline-offset-2 hover:text-foreground">
          Profile
        </Link>
        .
      </p>
    </div>
  );
}
