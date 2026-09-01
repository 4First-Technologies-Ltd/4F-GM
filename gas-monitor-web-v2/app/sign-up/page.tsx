'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Input } from '@/components/motion/input';
import { Checkbox } from '@/components/motion/checkbox';
import { Button } from '@/components/motion/button/base';
import { Eye, EyeOff } from 'lucide-react';

const PENDING_VENDOR_KEY = '4fg_pending_vendor_profile';

type Role = 'CONSUMER' | 'VENDOR';

export default function SignUpPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>('CONSUMER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!termsAccepted) {
      setError('Please accept the terms and conditions to continue.');
      return;
    }

    if (role === 'VENDOR' && (!businessName.trim() || !businessAddress.trim() || !phone.trim())) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      if (role === 'VENDOR') {
        window.sessionStorage.setItem(
          PENDING_VENDOR_KEY,
          JSON.stringify({
            businessName: businessName.trim(),
            businessAddress: businessAddress.trim(),
            phone: phone.trim()
          })
        );
      }

      const result = await register(name.trim(), email.trim(), password, role);
      const params = new URLSearchParams();
      params.set('email', result.email);
      if (role === 'VENDOR') params.set('role', 'VENDOR');
      router.push(`/verify-email?${params.toString()}`);
    } catch (err) {
      if (role === 'VENDOR') {
        window.sessionStorage.removeItem(PENDING_VENDOR_KEY);
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl bg-card p-8 shadow-lg">
          {/* Brand Header */}
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold text-primary">4F</span>
            <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-2">Create your account</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {role === 'CONSUMER'
              ? 'Monitor cylinders and order refills from trusted vendors.'
              : 'List gas products and manage incoming orders. Your account is reviewed before it goes live.'}
          </p>

          {/* Role Tabs */}
          <div className="flex gap-2 mb-6" role="group" aria-label="Account type">
            {(['CONSUMER', 'VENDOR'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                  role === r
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {r === 'CONSUMER' ? 'Consumer' : 'Vendor'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              label="Full name"
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={setName}
              error={false}
              placeholder="John Doe"
              classNames={{ root: 'w-full' }}
            />

            <Input
              label="Email address"
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={setEmail}
              error={false}
              placeholder="you@example.com"
              classNames={{ root: 'w-full' }}
            />

            <div>
              <Input
                label="Password"
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
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
              <p className="text-xs text-muted-foreground mt-2">At least 6 characters.</p>
            </div>

            {role === 'VENDOR' && (
              <>
                <Input
                  label="Business name"
                  id="businessName"
                  type="text"
                  required
                  value={businessName}
                  onChange={setBusinessName}
                  error={false}
                  placeholder="Your Business Ltd."
                  classNames={{ root: 'w-full' }}
                />

                <Input
                  label="Business address"
                  id="businessAddress"
                  type="text"
                  required
                  minLength={5}
                  value={businessAddress}
                  onChange={setBusinessAddress}
                  error={false}
                  placeholder="Street address"
                  classNames={{ root: 'w-full' }}
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
              </>
            )}

            <div className="flex items-start gap-3 py-2">
              <Checkbox
                id="terms"
                checked={termsAccepted}
                onCheckedChange={setTermsAccepted}
                className="mt-1"
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:text-primary/80 font-medium">
                  terms and conditions
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:text-primary/80 font-medium">
                  privacy policy
                </Link>
              </label>
            </div>

            {error && (
              <div
                className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              className="w-full font-semibold"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {role === 'VENDOR' ? 'Submitting application…' : 'Creating account…'}
                </span>
              ) : role === 'VENDOR' ? (
                'Submit application'
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          {/* Sign In Link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <Link href="/sign-in" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
