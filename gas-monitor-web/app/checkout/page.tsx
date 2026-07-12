'use client';

import { Suspense, useMemo, useState, FormEvent } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import SiteNav from '@/components/SiteNav';
import Footer from '@/components/Footer';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, InitializeOrderResult } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { getListing, AREAS, DELIVERY_FEE, MAX_QUANTITY, CATEGORY_LABEL } from '@/lib/catalog';
import { IconCheck, IconStar } from '@/components/icons';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/marketplace', label: 'Marketplace', active: true },
  { href: '/downloads', label: 'Download' },
  { href: '/contact', label: 'Contact' },
  { href: '/partner', label: 'Partner with us' }
];

type CheckoutMode = 'guest' | 'signin' | 'signup';

export default function CheckoutPage() {
  return (
    <>
      <main>
        <SiteNav variant="solid" brandHref="/" links={NAV_LINKS} />

        <section className="section marketplace-intro checkout-intro">
          <div className="container">
            <span className="badge">Secure checkout</span>
            <h1 className="marketplace-title">Almost there</h1>
            <ol className="checkout-steps" aria-label="Checkout progress">
              <li className="is-done">
                <span className="checkout-step-dot">
                  <IconCheck />
                </span>
                Product
              </li>
              <li className="is-current">
                <span className="checkout-step-dot">2</span>
                Delivery &amp; payment
              </li>
              <li>
                <span className="checkout-step-dot">3</span>
                Confirmation
              </li>
            </ol>
          </div>
        </section>

        <section className="section checkout-section">
          <div className="container">
            <Suspense fallback={null}>
              <CheckoutContent />
            </Suspense>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

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

  // Checkout mode for visitors who aren't signed in
  const [mode, setMode] = useState<CheckoutMode>('guest');
  const [guestEmail, setGuestEmail] = useState('');

  // Inline sign-in
  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Inline sign-up (+ OTP verification step)
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [otpPending, setOtpPending] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Delivery details
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState(AREAS[0]);
  const [notes, setNotes] = useState('');

  // Billing details
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
    return <p className="dashboard-welcome">Loading…</p>;
  }

  if (!item) {
    return (
      <div className="checkout-container">
        <div className="card market-empty">
          <h3>Your cart is empty</h3>
          <p>Pick a product in the marketplace first — your selection will carry over to checkout.</p>
          <a href="/marketplace" className="btn btn-primary">
            Browse the marketplace
          </a>
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
      // Stay right here — the page re-renders signed in with the cart intact.
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
      // Signed in — checkout continues below without leaving the page.
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
      <div className="checkout-container">
        <div className="card checkout-card checkout-success">
          <span className="checkout-success-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <h2>Payment confirmed — order placed</h2>
          <p className="hero-card-sub">
            {item.vendor} has received your order for {quantity} × {item.title}.
            {user
              ? ' Track its status from your dashboard.'
              : ` A receipt has been sent to ${guestEmail}. Create an account with that email to track your delivery.`}
          </p>
          <div className="checkout-signin-actions">
            {user ? (
              <a href="/dashboard/orders" className="btn btn-primary">
                Track my order
              </a>
            ) : (
              <a href="/sign-up" className="btn btn-primary">
                Create an account
              </a>
            )}
            <a href="/marketplace" className="btn btn-secondary">
              Back to marketplace
            </a>
          </div>
        </div>
      </div>
    );
  }

  const showOrderForm = user || mode === 'guest';

  return (
    <div className="checkout-layout">
      {/* ---------- Left: contact, delivery & billing ---------- */}
      <div className="checkout-forms">
        {user ? (
          <div className="checkout-signed-banner">
            <span className="checkout-signed-avatar" aria-hidden="true">
              {user.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase())
                .join('')}
            </span>
            <span>
              Signed in as <strong>{user.email}</strong>
            </span>
          </div>
        ) : (
          <div className="card checkout-form-card">
            <h2>Contact</h2>
            <div className="checkout-auth-tabs" role="tablist" aria-label="Checkout options">
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
                  className={`order-filter-tab${mode === m ? ' is-active' : ''}`}
                  onClick={() => {
                    setMode(m);
                    setAuthError(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'guest' && (
              <>
                <div className="field">
                  <label htmlFor="guest-email">Email address</label>
                  <input
                    id="guest-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                  />
                  <span className="field-help">
                    Your receipt and order updates go here. No password needed — you can create an account later with
                    the same email.
                  </span>
                </div>
              </>
            )}

            {mode === 'signin' && (
              <form onSubmit={handleSignin} noValidate>
                <div className="field">
                  <label htmlFor="ci-email">Email address</label>
                  <input
                    id="ci-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={signinEmail}
                    onChange={(e) => setSigninEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <div className="field-label-row">
                    <label htmlFor="ci-password">Password</label>
                    <a href="/forgot-password" className="field-label-action">
                      Forgot password?
                    </a>
                  </div>
                  <input
                    id="ci-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={signinPassword}
                    onChange={(e) => setSigninPassword(e.target.value)}
                  />
                </div>
                {authError && (
                  <p className="form-error" role="alert">
                    {authError}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={authBusy}>
                  {authBusy ? 'Signing in…' : 'Sign in & continue'}
                </button>
              </form>
            )}

            {mode === 'signup' && !otpPending && (
              <form onSubmit={handleSignup} noValidate>
                <div className="field">
                  <label htmlFor="cs-name">Full name</label>
                  <input
                    id="cs-name"
                    required
                    minLength={2}
                    autoComplete="name"
                    value={signupName}
                    onChange={(e) => setSignupName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cs-email">Email address</label>
                  <input
                    id="cs-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cs-password">Password</label>
                  <input
                    id="cs-password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                  />
                  <span className="field-help">At least 8 characters.</span>
                </div>
                {authError && (
                  <p className="form-error" role="alert">
                    {authError}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={authBusy}>
                  {authBusy ? 'Creating account…' : 'Create account & continue'}
                </button>
              </form>
            )}

            {mode === 'signup' && otpPending && (
              <form onSubmit={handleVerifyOtp} noValidate>
                {otpNotice && (
                  <p className="form-success" role="status">
                    {otpNotice}
                  </p>
                )}
                <div className="field">
                  <label htmlFor="cs-otp">Verification code</label>
                  <input
                    id="cs-otp"
                    className="otp-input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <span className="field-help">
                    Didn&apos;t get it?{' '}
                    <button type="button" className="otp-resend" onClick={handleResendOtp}>
                      Resend code
                    </button>
                  </span>
                </div>
                {authError && (
                  <p className="form-error" role="alert">
                    {authError}
                  </p>
                )}
                <button type="submit" className="btn btn-primary btn-block" disabled={authBusy || otpCode.length !== 6}>
                  {authBusy ? 'Verifying…' : 'Verify & continue'}
                </button>
              </form>
            )}
          </div>
        )}

        {showOrderForm && (
          <form onSubmit={handlePlaceOrder} noValidate>
            <div className="card checkout-form-card">
              <h2>Delivery details</h2>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="co-name">Full name</label>
                  <input
                    id="co-name"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="co-phone">Phone number</label>
                  <input
                    id="co-phone"
                    type="tel"
                    required
                    autoComplete="tel"
                    placeholder="0801 234 5678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="co-address">Delivery address</label>
                <input
                  id="co-address"
                  required
                  minLength={5}
                  autoComplete="street-address"
                  placeholder="Street, building, apartment"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="co-area">Area</label>
                  <select id="co-area" value={area} onChange={(e) => setArea(e.target.value)}>
                    {AREAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="co-notes">
                    Delivery notes <span className="field-help">(optional)</span>
                  </label>
                  <input
                    id="co-notes"
                    placeholder="Gate code, landmark…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="card checkout-form-card">
              <h2>Billing details</h2>
              <label className="filter-check checkout-billing-toggle">
                <input type="checkbox" checked={billingSame} onChange={(e) => setBillingSame(e.target.checked)} />
                <span className="filter-check-box" aria-hidden="true">
                  <IconCheck />
                </span>
                <span>Billing details are the same as delivery details</span>
              </label>

              {!billingSame && (
                <>
                  <div className="field">
                    <label htmlFor="co-billing-name">Billing name</label>
                    <input
                      id="co-billing-name"
                      required
                      value={billingName}
                      onChange={(e) => setBillingName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="co-billing-address">Billing address</label>
                    <input
                      id="co-billing-address"
                      required
                      minLength={5}
                      value={billingAddress}
                      onChange={(e) => setBillingAddress(e.target.value)}
                    />
                  </div>
                </>
              )}

              <p className="form-hint">
                Receipt will be sent to <strong>{user ? user.email : guestEmail || 'your email'}</strong>. Payment is
                processed securely by Paystack — we never store your card details.
              </p>
            </div>

            {placeError && (
              <p className="form-error" role="alert" aria-live="polite">
                {placeError}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block checkout-pay-btn" disabled={placingOrder}>
              {placingOrder ? 'Starting secure payment…' : `Pay ${formatNaira(total)}`}
            </button>

            {pendingPayment && (
              <div className="payment-panel">
                <p>
                  Order created for <strong>{formatNaira(pendingPayment.amount)}</strong>. Complete payment in the
                  Paystack tab, then come back and confirm.
                </p>
                <div className="payment-panel-actions">
                  <a
                    className="btn btn-secondary"
                    href={pendingPayment.authorizationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Complete payment
                  </a>
                  <button type="button" className="btn btn-primary" onClick={handleVerify} disabled={verifying}>
                    {verifying ? 'Checking…' : "I've paid — confirm"}
                  </button>
                </div>
                {verifyMessage && (
                  <p className="form-hint" aria-live="polite">
                    {verifyMessage}
                  </p>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {/* ---------- Right: order summary ---------- */}
      <aside className="checkout-summary" aria-label="Order summary">
        <div className="card checkout-summary-card">
          <h2>Order summary</h2>

          <div className="summary-item">
            {item.image ? (
              <div className="summary-item-media">
                <Image src={item.image} alt={item.title} fill sizes="88px" style={{ objectFit: 'cover' }} />
              </div>
            ) : (
              <span className="vendor-avatar summary-item-avatar" style={{ background: item.color }} aria-hidden="true">
                {item.initials}
              </span>
            )}
            <div className="summary-item-info">
              <span className="listing-category">{CATEGORY_LABEL[item.category]}</span>
              <strong>{item.title}</strong>
              <span className="summary-item-vendor">
                {item.vendor} · <IconStar /> {item.rating.toFixed(1)}
              </span>
              <a href={`/marketplace/${item.id}`} className="summary-edit-link">
                Edit item
              </a>
            </div>
          </div>

          <div className="summary-options">
            <div className="field">
              <label htmlFor="sum-size">Size / variant</label>
              <select id="sum-size" value={size} onChange={(e) => setSize(e.target.value)}>
                {item.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sum-qty">Quantity</label>
              <div className="qty-stepper">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
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
                />
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                  disabled={quantity >= MAX_QUANTITY}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <dl className="summary-totals">
            <div>
              <dt>
                {formatNaira(item.price)} × {quantity}
              </dt>
              <dd>{formatNaira(subtotal)}</dd>
            </div>
            <div>
              <dt>Delivery fee</dt>
              <dd>{formatNaira(DELIVERY_FEE)}</dd>
            </div>
            <div className="summary-total-row">
              <dt>Total</dt>
              <dd aria-live="polite">{formatNaira(total)}</dd>
            </div>
          </dl>

          <p className="summary-secure">
            <IconCheck /> Secured by Paystack · PCI-DSS compliant
          </p>
        </div>
      </aside>
    </div>
  );
}
