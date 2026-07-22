'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import PasswordInput from '@/components/PasswordInput';
import NetworkStatusDot from '@/components/NetworkStatusDot';

const PENDING_VENDOR_KEY = '4fg_pending_vendor_profile';

export default function VendorSignUpPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      window.sessionStorage.setItem(
        PENDING_VENDOR_KEY,
        JSON.stringify({
          businessName: businessName.trim(),
          businessAddress: businessAddress.trim(),
          phone: phone.trim()
        })
      );
      const result = await register(name.trim(), email.trim(), password, 'VENDOR');
      router.push(`/verify-email?email=${encodeURIComponent(result.email)}&role=VENDOR`);
    } catch (err) {
      window.sessionStorage.removeItem(PENDING_VENDOR_KEY);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <NetworkStatusDot />
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <h1 className="auth-title">Become a vendor</h1>
          <p className="auth-sub">List gas products and manage incoming orders. Your account is reviewed before it goes live.</p>

          <div className="role-tabs" role="group" aria-label="Choose account type">
            <button type="button" className="role-tab" onClick={() => router.push('/sign-up')}>
              Consumer
            </button>
            <button type="button" className="role-tab is-active">
              Vendor
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="field">
              <label htmlFor="name">Your full name</label>
              <input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="businessName">Business name</label>
              <input
                id="businessName"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="field-help">At least 6 characters.</span>
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="businessAddress">Business address</label>
              <input
                id="businessAddress"
                type="text"
                required
                minLength={5}
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
              />
            </div>

            {error && (
              <p className="form-error" role="alert" aria-live="polite">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Submitting application…' : 'Submit application'}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
