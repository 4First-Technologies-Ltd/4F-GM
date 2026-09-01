'use client';

import { Suspense, useMemo, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, InitializeOrderResult } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { Input } from '@/components/motion/input';
import { Checkbox } from '@/components/motion/checkbox';
import { Button } from '@/components/motion/button/base';
import { Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

// Mock data for catalog - in real app this would come from a catalog service
const AREAS = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan', 'Other'];
const DELIVERY_FEE = 2000;
const MAX_QUANTITY = 20;

const MOCK_CATALOG = {
  '1': {
    id: '1',
    title: 'Standard Gas Cylinder 12.5kg',
    vendor: 'GasX Nigeria',
    price: 8500,
    category: 'COOKING',
    sizes: ['12.5kg', '25kg', '50kg'],
    image: null,
    color: '#2D7450',
    initials: 'GX',
    rating: 4.5
  }
};

function getListing(id: string) {
  return MOCK_CATALOG[id as keyof typeof MOCK_CATALOG];
}

type CheckoutMode = 'guest' | 'signin' | 'signup';

function CheckoutContent() {
  const searchParams = useSearchParams();
  const { user, loading, login, register, verifyOtp, resendOtp } = useAuth();

  const item = useMemo(() => {
    const id = searchParams.get('item');
    return id ? getListing(id) : undefined;
  }, [searchParams]);

  const initialSize = searchParams.get('size') ?? item?.sizes[0] ?? '';
  const initialQty = Math.min(MAX_QUANTITY, Math.max(1, Number(searchParams.get('qty')) || 1));

  const [size, setSize] = useState(initialSize);
  const [quantity, setQuantity] = useState(initialQty);

  const [mode, setMode] = useState<CheckoutMode>('guest');
  const [guestEmail, setGuestEmail] = useState('');

  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [showSigninPassword, setShowSigninPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [otpPending, setOtpPending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState(AREAS[0]);
  const [notes, setNotes] = useState('');

  const [billingSame, setBillingSame] = useState(true);
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const [placingOrder, setPlacingOrder] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<InitializeOrderResult | null>(null);
  const [wasGuestPayment, setWasGuestPayment] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-2xl bg-card border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-2">Your cart is empty</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pick a product in the marketplace first — your selection will carry over to checkout.
          </p>
          <Link
            href="/marketplace"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Browse the marketplace
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = item.price * quantity;
  const total = subtotal + DELIVERY_FEE;
  const isGuest = !user;

  async function handleSignin(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      await login(signinEmail, signinPassword);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      await register(signupName, signupEmail, signupPassword);
      setOtpPending(true);
      setOtpNotice(`We sent a 6-digit code to ${signupEmail}. Enter it below to activate your account.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not create your account.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      await verifyOtp(signupEmail, otpCode);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid code. Try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResendOtp() {
    setAuthError(null);
    try {
      await resendOtp(signupEmail, 'SIGNUP_VERIFICATION');
      setOtpNotice(`A new code is on its way to ${signupEmail}.`);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Could not resend the code.');
    }
  }

  async function handlePlaceOrder(e: FormEvent) {
    e.preventDefault();
    setPlaceError(null);
    setVerifyMessage(null);

    if (isGuest && !/.+@.+\..+/.test(guestEmail)) {
      setPlaceError('Enter a valid email address so we can send your receipt and order updates.');
      return;
    }

    setPlacingOrder(true);
    try {
      const composedAddress = `${address.trim()}, ${area}${phone.trim() ? ` · Tel: ${phone.trim()}` : ''}${
        notes.trim() ? ` · Note: ${notes.trim()}` : ''
      }`;
      const payload = {
        supplierName: item!.vendor,
        cylinderSize: size,
        quantity,
        totalAmount: total,
        deliveryAddress: composedAddress
      };
      const result = isGuest
        ? await ordersApi.guestInitialize({ ...payload, email: guestEmail, name: fullName })
        : await ordersApi.initialize(payload);
      setWasGuestPayment(isGuest);
      setPendingPayment(result);
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleVerify() {
    if (!pendingPayment) return;
    setVerifying(true);
    setVerifyMessage(null);
    try {
      if (wasGuestPayment) {
        await ordersApi.guestVerify(pendingPayment.reference);
      } else {
        await ordersApi.verify(pendingPayment.reference);
      }
      setCompleted(true);
      setPendingPayment(null);
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : 'Payment not verified yet. Complete checkout, then try again.');
    } finally {
      setVerifying(false);
    }
  }

  if (completed) {
    return (
      <div className="max-w-md mx-auto">
        <div className="rounded-2xl bg-card border border-border p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100/50 flex items-center justify-center mx-auto mb-4">
            <Check className="h-6 w-6 text-green-700" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Payment confirmed — order placed</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {item.vendor} has received your order for {quantity} × {item.title}.
            {user
              ? ' Track its status from your dashboard.'
              : ` A receipt has been sent to ${guestEmail}. Create an account with that email to track your delivery.`}
          </p>
          <div className="flex flex-col gap-2">
            {user ? (
              <Link
                href="/dashboard/orders"
                className="block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors text-center"
              >
                Track my order
              </Link>
            ) : (
              <Link
                href="/sign-up"
                className="block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors text-center"
              >
                Create an account
              </Link>
            )}
            <Link
              href="/marketplace"
              className="block px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors text-center"
            >
              Back to marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const showOrderForm = user || mode === 'guest';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Forms */}
      <div className="lg:col-span-2 space-y-6">
        {/* Contact / Auth */}
        {!user && (
          <div className="rounded-2xl bg-card border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Contact</h2>
            <div className="flex gap-2 mb-6" role="tablist" aria-label="Checkout options">
              {(
                [
                  ['guest', 'Continue as guest'],
                  ['signin', 'Sign in'],
                  ['signup', 'Create account']
                ] as [CheckoutMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => {
                    setMode(m);
                    setAuthError(null);
                  }}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
                    mode === m
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'guest' && (
              <div>
                <Input
                  label="Email address"
                  id="guest-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={guestEmail}
                  onChange={setGuestEmail}
                  error={false}
                  placeholder="you@example.com"
                  classNames={{ root: 'w-full' }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Your receipt and order updates go here. No password needed — you can create an account later with the same email.
                </p>
              </div>
            )}

            {mode === 'signin' && (
              <form onSubmit={handleSignin} noValidate className="space-y-4">
                <Input
                  label="Email address"
                  id="ci-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={signinEmail}
                  onChange={setSigninEmail}
                  error={false}
                  classNames={{ root: 'w-full' }}
                />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="ci-password" className="text-sm font-medium text-foreground">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="text-xs text-primary hover:text-primary/80 font-medium"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="ci-password"
                    type={showSigninPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={signinPassword}
                    onChange={setSigninPassword}
                    error={false}
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowSigninPassword(!showSigninPassword)}
                        className="flex items-center justify-center h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showSigninPassword ? 'Hide password' : 'Show password'}
                      >
                        {showSigninPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                    classNames={{ root: 'w-full' }}
                  />
                </div>
                {authError && (
                  <div
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>{authError}</div>
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={authBusy}
                  className="w-full"
                >
                  {authBusy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Signing in…
                    </span>
                  ) : (
                    'Sign in & continue'
                  )}
                </Button>
              </form>
            )}

            {mode === 'signup' && !otpPending && (
              <form onSubmit={handleSignup} noValidate className="space-y-4">
                <Input
                  label="Full name"
                  id="cs-name"
                  type="text"
                  required
                  minLength={2}
                  autoComplete="name"
                  value={signupName}
                  onChange={setSignupName}
                  error={false}
                  classNames={{ root: 'w-full' }}
                />
                <Input
                  label="Email address"
                  id="cs-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={signupEmail}
                  onChange={setSignupEmail}
                  error={false}
                  classNames={{ root: 'w-full' }}
                />
                <div>
                  <Input
                    label="Password"
                    id="cs-password"
                    type={showSignupPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={setSignupPassword}
                    error={false}
                    rightIcon={
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="flex items-center justify-center h-11 w-11 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                    classNames={{ root: 'w-full' }}
                  />
                  <p className="text-xs text-muted-foreground mt-2">At least 8 characters.</p>
                </div>
                {authError && (
                  <div
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>{authError}</div>
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={authBusy}
                  className="w-full"
                >
                  {authBusy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Creating account…
                    </span>
                  ) : (
                    'Create account & continue'
                  )}
                </Button>
              </form>
            )}

            {mode === 'signup' && otpPending && (
              <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
                {otpNotice && (
                  <div
                    className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700"
                    role="status"
                  >
                    {otpNotice}
                  </div>
                )}
                <Input
                  label="Verification code"
                  id="cs-otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(val) => setOtpCode(val.replace(/\D/g, ''))}
                  error={false}
                  placeholder="000000"
                  classNames={{ root: 'w-full text-center tracking-widest text-2xl font-bold' }}
                />
                <p className="text-xs text-muted-foreground">
                  Didn&apos;t get it?{' '}
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-primary hover:text-primary/80 font-medium"
                  >
                    Resend code
                  </button>
                </p>
                {authError && (
                  <div
                    className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                    role="alert"
                  >
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>{authError}</div>
                  </div>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={authBusy || otpCode.length !== 6}
                  className="w-full"
                >
                  {authBusy ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Verifying…
                    </span>
                  ) : (
                    'Verify & continue'
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        {user && (
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {user.name
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join('')}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Signed in as</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Delivery & Billing Forms */}
        {showOrderForm && (
          <form onSubmit={handlePlaceOrder} noValidate className="space-y-6">
            <div className="rounded-2xl bg-card border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Delivery details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full name"
                  id="co-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={setFullName}
                  error={false}
                  classNames={{ root: 'w-full' }}
                />
                <Input
                  label="Phone number"
                  id="co-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={setPhone}
                  error={false}
                  placeholder="0801 234 5678"
                  classNames={{ root: 'w-full' }}
                />
              </div>
              <div>
                <Input
                  label="Delivery address"
                  id="co-address"
                  type="text"
                  required
                  minLength={5}
                  autoComplete="street-address"
                  value={address}
                  onChange={setAddress}
                  error={false}
                  placeholder="Street, building, apartment"
                  classNames={{ root: 'w-full mt-4' }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label htmlFor="co-area" className="block text-sm font-medium text-foreground mb-2">
                    Area
                  </label>
                  <select
                    id="co-area"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors"
                  >
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Delivery notes (optional)"
                  id="co-notes"
                  type="text"
                  value={notes}
                  onChange={setNotes}
                  error={false}
                  placeholder="Gate code, landmark…"
                  classNames={{ root: 'w-full' }}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-card border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Billing details</h2>
              <div className="flex items-start gap-3 mb-4">
                <Checkbox
                  id="billing-same"
                  checked={billingSame}
                  onCheckedChange={setBillingSame}
                  className="mt-1"
                />
                <label htmlFor="billing-same" className="text-sm text-foreground cursor-pointer">
                  Billing details are the same as delivery details
                </label>
              </div>

              {!billingSame && (
                <div className="space-y-4">
                  <Input
                    label="Billing name"
                    id="co-billing-name"
                    type="text"
                    required
                    value={billingName}
                    onChange={setBillingName}
                    error={false}
                    classNames={{ root: 'w-full' }}
                  />
                  <Input
                    label="Billing address"
                    id="co-billing-address"
                    type="text"
                    required
                    minLength={5}
                    value={billingAddress}
                    onChange={setBillingAddress}
                    error={false}
                    classNames={{ root: 'w-full' }}
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-4">
                Receipt will be sent to <strong>{user ? user.email : guestEmail || 'your email'}</strong>. Payment is processed securely by Paystack — we never store your card details.
              </p>
            </div>

            {placeError && (
              <div
                className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
                role="alert"
                aria-live="polite"
              >
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>{placeError}</div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={placingOrder}
              className="w-full"
            >
              {placingOrder ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Starting secure payment…
                </span>
              ) : (
                `Pay ${formatNaira(total)}`
              )}
            </Button>

            {pendingPayment && (
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-6">
                <p className="text-sm text-blue-900 mb-4">
                  Order created for <strong>{formatNaira(pendingPayment.amount)}</strong>. Complete payment in the Paystack tab, then come back and confirm.
                </p>
                <div className="space-y-2">
                  <a
                    className="block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors text-center"
                    href={pendingPayment.authorizationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Complete payment
                  </a>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={handleVerify}
                    disabled={verifying}
                    className="w-full"
                  >
                    {verifying ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Checking…
                      </span>
                    ) : (
                      "I've paid — confirm"
                    )}
                  </Button>
                </div>
                {verifyMessage && (
                  <p className="text-xs text-muted-foreground mt-3 aria-live-polite">
                    {verifyMessage}
                  </p>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Right: Order Summary */}
      <aside className="lg:col-span-1">
        <div className="sticky top-6 rounded-2xl bg-card border border-border p-6">
          <h2 className="text-lg font-semibold text-foreground mb-6">Order summary</h2>

          {/* Product Card */}
          <div className="pb-6 border-b border-border">
            <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary mb-3" style={{ background: item.color }}>
              {item.initials}
            </div>
            <p className="text-xs text-muted-foreground mb-1">GAS</p>
            <p className="font-semibold text-foreground mb-1">{item.title}</p>
            <p className="text-xs text-muted-foreground">
              {item.vendor} · ★ {item.rating.toFixed(1)}
            </p>
            <Link
              href={`/marketplace/${item.id}`}
              className="text-xs text-primary hover:text-primary/80 font-medium mt-2 block"
            >
              Edit item
            </Link>
          </div>

          {/* Options */}
          <div className="py-6 space-y-4 border-b border-border">
            <div>
              <label htmlFor="sum-size" className="block text-sm font-medium text-foreground mb-2">
                Size / variant
              </label>
              <select
                id="sum-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors"
              >
                {item.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sum-qty" className="block text-sm font-medium text-foreground mb-2">
                Quantity
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  id="sum-qty"
                  type="number"
                  min={1}
                  max={MAX_QUANTITY}
                  value={quantity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setQuantity(Math.min(MAX_QUANTITY, Math.max(1, Math.round(v))));
                  }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  disabled={quantity >= MAX_QUANTITY}
                  className="px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Totals */}
          <dl className="py-6 space-y-3 border-b border-border">
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">
                {formatNaira(item.price)} × {quantity}
              </dt>
              <dd className="text-sm font-medium text-foreground">{formatNaira(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Delivery fee</dt>
              <dd className="text-sm font-medium text-foreground">{formatNaira(DELIVERY_FEE)}</dd>
            </div>
            <div className="flex justify-between pt-3 border-t border-border">
              <dt className="font-semibold text-foreground">Total</dt>
              <dd className="font-bold text-foreground text-lg" aria-live="polite">
                {formatNaira(total)}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted-foreground mt-6 flex items-start gap-2">
            <Check className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-700" />
            <span>Secured by Paystack · PCI-DSS compliant</span>
          </p>
        </div>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutContent />
    </Suspense>
  );
}
