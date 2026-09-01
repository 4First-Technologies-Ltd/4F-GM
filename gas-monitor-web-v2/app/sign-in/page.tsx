'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { Eye, EyeOff } from 'lucide-react';

export default function SignInPage() {
  const { login, logout } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<'CONSUMER' | 'VENDOR'>('CONSUMER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role !== role) {
        await logout();
        setError(
          user.role === 'VENDOR'
            ? 'This account is registered as a Vendor. Switch to the Vendor tab to sign in.'
            : 'This account is registered as a Consumer. Switch to the Consumer tab to sign in.'
        );
        return;
      }
      if (user.role === 'VENDOR' && user.vendorStatus !== 'APPROVED') {
        router.push('/vendor-pending');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-card p-8 shadow-lg">
          {/* Brand Header */}
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="text-lg font-bold text-primary">4F</span>
            <span className="text-sm font-medium text-foreground">4FG Smart Gas Monitor</span>
          </Link>

          <h1 className="text-2xl font-bold text-foreground mb-2">Welcome back</h1>
          <p className="text-sm text-muted-foreground mb-6">Sign in to track cylinders, reminders, and orders.</p>

          {/* Role Tabs */}
          <div className="flex gap-2 mb-6" role="group" aria-label="Sign in as">
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
                autoComplete="current-password"
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
              <Link
                href="/forgot-password"
                className="inline-block text-xs text-primary hover:text-primary/80 font-medium mt-2 transition-colors"
              >
                Forgot password?
              </Link>
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
                  Signing in…
                </span>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>

          {/* Sign Up Link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/sign-up" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
