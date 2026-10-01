'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { riderApi, RiderStatus } from '@/lib/api';
import { homeRouteFor } from '@/lib/home-route';
import { Button, ButtonLink } from '@/components/motion/button/base';
import { LogoEmblem } from '@/components/site/Logo';
import { RiderDetailsFields } from '@/components/rider/RiderDetailsFields';

type ViewState = RiderStatus | 'NO_PROFILE';

export default function RiderPendingPage() {
  const { user, loading, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ViewState>('PENDING');
  const [checking, setChecking] = useState(false);

  // finish-setup form
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const fresh = await refreshUser();
      if (fresh.role === 'RIDER' && fresh.riderStatus === 'APPROVED') {
        router.replace(homeRouteFor(fresh));
        return;
      }
      if (fresh.riderStatus) {
        setState(fresh.riderStatus);
      } else {
        // No profile row yet — e.g. sign-up was interrupted after email verification.
        try {
          await riderApi.getProfile();
        } catch {
          setState('NO_PROFILE');
        }
      }
    } catch {
      // offline: keep showing the last known state
    } finally {
      setChecking(false);
    }
  }, [refreshUser, router]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/sign-in');
      return;
    }
    if (user.role !== 'RIDER') {
      router.replace(homeRouteFor(user));
      return;
    }
    check();
  }, [loading, user?.id, user?.role]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmitDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !vehicleType) {
      setError('Add your phone number and choose a vehicle type.');
      return;
    }
    setSubmitting(true);
    try {
      await riderApi.createProfile({
        phone: phone.trim(),
        vehicleType,
        plateNumber: plateNumber.trim() || undefined
      });
      setState('PENDING');
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await logout();
    router.push('/');
  }

  const rejected = state === 'REJECTED';

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
        </Link>

        <span
          className={`grid h-10 w-10 place-items-center rounded-full ${
            rejected ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
          }`}
        >
          {rejected ? <XCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
        </span>

        {state === 'NO_PROFILE' ? (
          <>
            <h1 className="mt-4 text-2xl font-bold text-foreground">Finish setting up</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your email is verified, but we don&apos;t have your rider details yet. Add them to submit your
              application.
            </p>
            <form onSubmit={handleSubmitDetails} noValidate className="mt-6 space-y-4">
              <RiderDetailsFields
                phone={phone}
                vehicleType={vehicleType}
                plateNumber={plateNumber}
                onPhoneChange={setPhone}
                onVehicleTypeChange={setVehicleType}
                onPlateNumberChange={setPlateNumber}
                disabled={submitting}
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit application'}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-2xl font-bold text-foreground">
              {rejected ? 'Application not approved' : 'Application received'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {rejected
                ? "We couldn't approve your rider application. Contact support if you think this is a mistake."
                : "Your rider account is under review by the 4FG team. You'll be able to take deliveries as soon as it's approved — this usually takes within 24 hours."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {!rejected && (
                <Button type="button" size="lg" onClick={check} disabled={checking}>
                  {checking ? 'Checking…' : 'Check status'}
                </Button>
              )}
              <ButtonLink href="/" variant="outline" size="lg">
                Back to site
              </ButtonLink>
            </div>
          </>
        )}

        <p className="mt-6 text-sm text-muted-foreground">
          Need help? <span className="font-medium text-primary">support@4fg.com</span>
          {' · '}
          <button
            type="button"
            onClick={handleSignOut}
            className="font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
