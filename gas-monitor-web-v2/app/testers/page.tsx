'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTesterSession, saveTesterSession, testersApi } from '@/lib/testers';
import { LogoEmblem } from '@/components/site/Logo';
import { helpCls, inputCls, labelCls, primaryBtn, secondaryBtn } from '@/components/testers/shell';

/** Where to go after signing in: the bug form if the app sent them here, else their reports. */
function takeNext() {
  try {
    if (sessionStorage.getItem('tester-next') === 'report') {
      sessionStorage.removeItem('tester-next');
      return '/testers/report';
    }
  } catch {}
  return '/testers/reports';
}

/** Sign-in for invited beta testers: an emailed one-time code, no password. */
export default function TesterSignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getTesterSession()) router.replace(takeNext());
  }, [router]);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await testersApi.requestCode(email.trim());
      setStep('code');
      // The server only returns the code outside production, for local testing.
      setNotice(res.otp ? `Local test code: ${res.otp}` : 'If that address is on the test team, a 6-digit code is on its way. It can take a minute.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const session = await testersApi.verifyCode(email.trim(), code.trim());
      saveTesterSession(session);
      router.replace(takeNext());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-2">
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG beta testing</span>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-foreground">Sign in to the bug tracker</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          This is for invited testers. Use the email address you were invited with; we send a one-time code, so there is no password.
        </p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && step === 'code' && (
          <p role="status" className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
            {notice}
          </p>
        )}

        {step === 'email' ? (
          <form onSubmit={requestCode}>
            <label className={labelCls} htmlFor="email">
              Email address
            </label>
            <input id="email" type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            <button type="submit" className={`${primaryBtn} mt-5 w-full`} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label className={labelCls} htmlFor="code">
              6-digit code sent to {email}
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              required
              className={`${inputCls} text-center text-2xl tracking-[0.5em]`}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <p className={helpCls}>The code lasts 10 minutes.</p>
            <button type="submit" className={`${primaryBtn} mt-5 w-full`} disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              type="button"
              className={`${secondaryBtn} mt-3 w-full`}
              disabled={busy}
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Use a different email or resend
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
