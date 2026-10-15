'use client';

import { useState, type FormEvent } from 'react';
import { sendJson } from '@/lib/post';
import { useAdminSession } from '@/lib/admin-session-context';

interface Setup {
  secret: string;
  qr: string;
}

/** Authenticator-app enrolment. Shown to named admins; required by default. */
export function MfaSection() {
  const { mfaEnabled, mfaEnrollRequired } = useAdminSession();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      setSetup(await sendJson<Setup>('POST', '/auth/mfa/setup'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start setup');
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await sendJson<{ recoveryCodes: string[] }>('POST', '/auth/mfa/enable', { code: code.trim() });
      setRecovery(res.recoveryCodes);
      setSetup(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  }

  // Full navigation so the shell re-reads /auth/me and lifts the enrolment gate.
  if (recovery) {
    return (
      <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 420 }}>
        <h2 className="adm-micro-label">Save your recovery codes</h2>
        <p className="adm-field-help">
          Each code works once if you lose your phone. They are shown only now. Store them in a password manager.
        </p>
        <pre style={{ userSelect: 'all', fontFamily: 'var(--font-mono, monospace)', padding: 12, border: '1px solid var(--border, #E0EEE0)', borderRadius: 8 }}>{recovery.join('\n')}</pre>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          <span>I have saved these codes</span>
        </label>
        <div>
          <button className="adm-btn adm-btn--primary" disabled={!saved} onClick={() => window.location.assign('/dashboard')}>
            Continue
          </button>
        </div>
      </section>
    );
  }

  if (mfaEnabled) {
    return (
      <section style={{ maxWidth: 420 }}>
        <h2 className="adm-micro-label">Two-step verification</h2>
        <p className="adm-field-help" role="status">
          On. You will be asked for a code from your authenticator app each time you sign in. If you lose your phone,
          ask a super admin to reset it.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 420 }}>
      <h2 className="adm-micro-label">Two-step verification</h2>
      {mfaEnrollRequired && (
        <p className="adm-field-help" role="alert">
          Set this up before you continue. It protects the platform if your password is ever stolen.
        </p>
      )}
      {!setup ? (
        <div>
          <button className="adm-btn adm-btn--primary" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Set up authenticator app'}
          </button>
        </div>
      ) : (
        <form onSubmit={confirm} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <p className="adm-field-help">
            1. Open Google Authenticator, Microsoft Authenticator or 1Password and scan this code.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={240} height={240} />
          <p className="adm-field-help">
            Can&apos;t scan? Enter this key instead: <code style={{ userSelect: 'all' }}>{setup.secret}</code>
          </p>
          <label className="adm-field">
            <span className="adm-field-label">2. Enter the 6-digit code it shows</span>
            <input
              className="adm-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
            />
          </label>
          <div>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
              {busy ? 'Checking…' : 'Turn on'}
            </button>
          </div>
        </form>
      )}
      {error && <p className="adm-field-error" role="alert">{error}</p>}
    </section>
  );
}
