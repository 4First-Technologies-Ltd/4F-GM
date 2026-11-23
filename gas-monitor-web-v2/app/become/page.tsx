'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { companyApi, riderApi, vendorApi, type UserRole } from '@/lib/api';
import { homeRouteFor } from '@/lib/home-route';
import { DEFAULT_VENDOR_PLAN } from '@/lib/plans';
import { isValidRcNumber, RC_NUMBER_HINT } from '@/lib/rcNumber';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { LogoEmblem } from '@/components/site/Logo';
import { StateCityFields } from '@/components/vendor/StateCityFields';
import { RiderDetailsFields } from '@/components/rider/RiderDetailsFields';
import { CompanyDetailsFields } from '@/components/company/CompanyDetailsFields';

type Joinable = 'VENDOR' | 'RIDER' | 'LOGISTICS_COMPANY';

const TITLES: Record<Joinable, { title: string; blurb: string; cta: string }> = {
  VENDOR: {
    title: 'Register your business',
    blurb: 'Sell gas on the marketplace from the account you already use. Your orders and details stay as they are.',
    cta: 'Submit application'
  },
  RIDER: {
    title: 'Become a delivery partner',
    blurb: 'Accept deliveries from vendors and earn, using the account you already have.',
    cta: 'Submit application'
  },
  LOGISTICS_COMPANY: {
    title: 'Register your fleet',
    blurb: 'Invite riders and watch their deliveries, using the account you already have.',
    cta: 'Submit application'
  }
};

const parse = (v: string | null): Joinable | null =>
  v === 'VENDOR' || v === 'RIDER' || v === 'LOGISTICS_COMPANY' ? v : null;

export default function BecomePage() {
  return (
    <Suspense fallback={null}>
      <BecomeContent />
    </Suspense>
  );
}

/**
 * Add a second role to the signed-in account. Creates the profile exactly as sign-up
 * does (pending approval), then switches into it. Nothing about the account changes.
 */
function BecomeContent() {
  const role = parse(useSearchParams().get('role'));
  const { user, loading, switchRole, refreshUser } = useAuth();
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');
  const [rcNumber, setRcNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/sign-in');
    else if (!role) router.replace('/dashboard');
  }, [loading, user, role, router]);

  if (!user || !role) return null;
  const copy = TITLES[role];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (role === 'VENDOR') {
      if (!name.trim() || !address.trim() || !stateName || !city.trim() || !phone.trim()) {
        setError('Fill in every field.');
        return;
      }
      if (!isValidRcNumber(rcNumber)) {
        setError('Enter a valid RC number, e.g. RC1234567.');
        return;
      }
    } else if (role === 'RIDER') {
      if (!phone.trim() || !vehicleType) {
        setError('Add your phone number and choose a vehicle type.');
        return;
      }
    } else if (!name.trim() || !phone.trim() || !address.trim()) {
      setError('Add your company name, phone number and address.');
      return;
    }

    setSubmitting(true);
    try {
      if (role === 'VENDOR') {
        await vendorApi.createProfile({
          businessName: name.trim(),
          businessAddress: address.trim(),
          state: stateName,
          city: city.trim(),
          phone: phone.trim(),
          rcNumber: rcNumber.trim(),
          plan: DEFAULT_VENDOR_PLAN
        });
      } else if (role === 'RIDER') {
        await riderApi.createProfile({
          phone: phone.trim(),
          vehicleType,
          plateNumber: plateNumber.trim() || undefined
        });
      } else {
        await companyApi.createProfile({
          companyName: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          ...(stateName ? { state: stateName } : {}),
          ...(city.trim() ? { city: city.trim() } : {})
        });
      }
      // Pending accounts get the whole app, so switch straight in.
      const updated = await switchRole(role as UserRole);
      router.replace(homeRouteFor(updated));
    } catch (err) {
      // The profile may exist even if the switch failed: refresh so the switcher shows it.
      await refreshUser().catch(() => {});
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 shadow-lg">
        <Link href="/dashboard" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <LogoEmblem size={40} />
          <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
        </Link>

        <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.blurb}</p>

        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          {role === 'VENDOR' && (
            <>
              <Input
                label="Business name"
                id="businessName"
                type="text"
                required
                value={name}
                onChange={setName}
                error={false}
                classNames={{ root: 'w-full' }}
              />
              <Input
                label="Business address"
                id="businessAddress"
                type="text"
                required
                value={address}
                onChange={setAddress}
                error={false}
                placeholder="Street address"
                classNames={{ root: 'w-full' }}
              />
              <StateCityFields
                state={stateName}
                city={city}
                onStateChange={setStateName}
                onCityChange={setCity}
                required
                disabled={submitting}
              />
              <Input
                label="Phone number"
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={setPhone}
                error={false}
                placeholder="0801 234 5678"
                classNames={{ root: 'w-full' }}
              />
              <Input
                label="RC number"
                id="rcNumber"
                type="text"
                required
                value={rcNumber}
                onChange={setRcNumber}
                error={false}
                placeholder="RC1234567"
                classNames={{ root: 'w-full' }}
              />
              <p className="-mt-3 text-xs text-muted-foreground">{RC_NUMBER_HINT}</p>
            </>
          )}

          {role === 'RIDER' && (
            <RiderDetailsFields
              phone={phone}
              vehicleType={vehicleType}
              plateNumber={plateNumber}
              onPhoneChange={setPhone}
              onVehicleTypeChange={setVehicleType}
              onPlateNumberChange={setPlateNumber}
              disabled={submitting}
            />
          )}

          {role === 'LOGISTICS_COMPANY' && (
            <CompanyDetailsFields
              companyName={name}
              phone={phone}
              address={address}
              state={stateName}
              city={city}
              onCompanyNameChange={setName}
              onPhoneChange={setPhone}
              onAddressChange={setAddress}
              onStateChange={setStateName}
              onCityChange={setCity}
              disabled={submitting}
            />
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? 'Submitting…' : copy.cta}
          </Button>
          <Link
            href="/dashboard"
            className="block text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Cancel
          </Link>
        </form>
      </div>
    </main>
  );
}
