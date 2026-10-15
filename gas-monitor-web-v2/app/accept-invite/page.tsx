'use client';

import { Suspense, useEffect, useState, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, MailX } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { authApi, ApiRequestError, type InviteInfo } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button, ButtonLink } from '@/components/motion/button/base';
import { LegalConsent } from '@/components/legal/LegalConsent';
import { LogoEmblem } from '@/components/site/Logo';

/**
 * Where an invited branch manager lands from the invitation email. This page is
 * deliberately not linked from sign-up: the one-time link in the email is the only
 * way in, and it proves the invitee owns the address.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
        </Link>
        {children}
      </div>
    </main>
  );
}

function AcceptInviteContent() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const { acceptInvite } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [state, setState] = useState<'loading' | 'invalid' | 'ready' | 'linked'>('loading');

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [consentInvalid, setConsentInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('invalid');
      return;
    }
    authApi
      .peekInvite(token)
      .then((i) => {
        setInvite(i);
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const linkOnly = invite?.canLink ?? false;

    if (!linkOnly) {
      if (!name.trim()) return setError('Enter your name.');
      if (!termsAccepted || !privacyAccepted) {
        setConsentInvalid(true);
        return setError('Please read and accept the Terms and Conditions and the Privacy Policy to continue.');
      }
    }

    setSubmitting(true);
    try {
      const result = await acceptInvite(token, { name: name.trim(), password });
      if (result.status === 'LINKED') {
        setState('linked');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'INVITE_INVALID') {
        setState('invalid');
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Checking your invitation…</p>
      </Shell>
    );
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
          <MailX className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-foreground">This link no longer works</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invitation links work once and expire after 14 days. Ask the vendor to send you a new invitation from their
          Branches page.
        </p>
        <ButtonLink href="/sign-in" variant="outline" size="lg" className="mt-6">
          Sign in
        </ButtonLink>
      </Shell>
    );
  }

  if (state === 'linked') {
    return (
      <Shell>
        <h1 className="text-2xl font-bold text-foreground mb-2">Branch added</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {invite?.branchName} is now on your branch manager account. Sign in to see it.
        </p>
        <ButtonLink href="/sign-in" size="lg" className="w-full">
          Sign in
        </ButtonLink>
      </Shell>
    );
  }

  // ready
  const mismatch = invite?.accountExists && !invite.canLink;

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-foreground mb-2">Set up your account</h1>
      <p className="text-sm text-muted-foreground mb-6">
        <strong className="text-foreground">{invite?.businessName}</strong> invited you to manage{' '}
        <strong className="text-foreground">{invite?.branchName}</strong>.
      </p>

      {mismatch ? (
        <>
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {invite?.email} already has a 4FG account of a different type, which cannot also manage a branch. Ask the
            vendor to invite a different email address.
          </p>
          <ButtonLink href="/sign-in" variant="outline" size="lg" className="mt-6">
            Sign in
          </ButtonLink>
        </>
      ) : invite?.canLink ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You already have a branch manager account for <strong className="text-foreground">{invite.email}</strong>.
            Add this branch to it.
          </p>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add this branch'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
            <p className="rounded-lg border border-input bg-muted/40 px-4 py-3 text-sm text-foreground">{invite?.email}</p>
          </div>

          <Input
            label="Full name"
            id="name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={setName}
            error={false}
            placeholder="Your name"
            classNames={{ root: 'w-full' }}
          />

          <div>
            <Input
              label="Choose a password"
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={setPassword}
              error={false}
              placeholder="••••••••"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="flex items-center justify-center h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              classNames={{ root: 'w-full' }}
            />
            <p className="text-xs text-muted-foreground mt-2">At least 8 characters. Avoid common passwords.</p>
          </div>

          <LegalConsent
            termsAccepted={termsAccepted}
            privacyAccepted={privacyAccepted}
            onTermsChange={(v) => {
              setTermsAccepted(v);
              setError(null);
            }}
            onPrivacyChange={(v) => {
              setPrivacyAccepted(v);
              setError(null);
            }}
            invalid={consentInvalid && !(termsAccepted && privacyAccepted)}
            disabled={submitting}
          />

          {error && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Creating your account…' : 'Create account'}
          </Button>
        </form>
      )}
    </Shell>
  );
}
