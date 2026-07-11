'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorProfile, ApiRequestError } from '@/lib/api';

export default function SettingsPage() {
  const { user, logout, updateProfile } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailNotifEnabled, setEmailNotifEnabled] = useState(true);
  const [smsAlertsEnabled, setSmsAlertsEnabled] = useState(false);
  const [unitPreference, setUnitPreference] = useState<'KG' | 'LBS'>('KG');
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [bio, setBio] = useState('');
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone ?? '');
    setPushEnabled(user.pushEnabled);
    setEmailNotifEnabled(user.emailNotifEnabled);
    setSmsAlertsEnabled(user.smsAlertsEnabled);
    setUnitPreference(user.unitPreference);
  }, [user]);

  useEffect(() => {
    if (user?.role !== 'VENDOR') return;
    vendorApi
      .getProfile()
      .then((profile) => {
        setVendorProfile(profile);
        setBusinessName(profile.businessName);
        setBusinessAddress(profile.businessAddress);
        setBusinessPhone(profile.phone);
        setBio(profile.bio ?? '');
      })
      .catch(() => {});
  }, [user?.role]);

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      await updateProfile({ name, phone: phone || null });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePrefChange(patch: Partial<{
    pushEnabled: boolean;
    emailNotifEnabled: boolean;
    smsAlertsEnabled: boolean;
    unitPreference: 'KG' | 'LBS';
  }>) {
    setPrefsSaved(false);
    try {
      const updated = await updateProfile(patch);
      setPushEnabled(updated.pushEnabled);
      setEmailNotifEnabled(updated.emailNotifEnabled);
      setSmsAlertsEnabled(updated.smsAlertsEnabled);
      setUnitPreference(updated.unitPreference);
      setPrefsSaved(true);
    } catch {
      // revert visually by re-reading user prefs on next render; no-op here
    }
  }

  async function handleBusinessSubmit(e: FormEvent) {
    e.preventDefault();
    setBusinessError(null);
    setSavingBusiness(true);
    setBusinessSaved(false);
    try {
      const updated = await vendorApi.updateProfile({
        businessName,
        businessAddress,
        phone: businessPhone,
        bio: bio || null
      });
      setVendorProfile(updated);
      setBusinessSaved(true);
    } catch (err) {
      setBusinessError(err instanceof ApiRequestError ? err.message : 'Could not save your business profile.');
    } finally {
      setSavingBusiness(false);
    }
  }

  if (!user) return null;

  return (
    <div className="settings-page">
      <section className="card settings-section">
        <h2>Profile</h2>
        <p className="hero-card-sub">Update your name and phone number.</p>

        <form onSubmit={handleProfileSubmit} noValidate>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="field">
            <label>Email address</label>
            <input value={user.email} disabled />
            <p className="field-help">Contact support to change your email address.</p>
          </div>

          {profileError && (
            <p className="form-error" role="alert">
              {profileError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </button>
          {profileSaved && (
            <p className="form-hint" aria-live="polite">
              Saved.
            </p>
          )}
        </form>

        <dl className="account-list">
          <div>
            <dt>Account type</dt>
            <dd>{user.role === 'VENDOR' ? 'Vendor' : 'Consumer'}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>

      {user.role === 'VENDOR' && (
        <section className="card settings-section">
          <h2>Business profile</h2>
          <p className="hero-card-sub">Shown to consumers browsing the marketplace.</p>

          <form onSubmit={handleBusinessSubmit} noValidate>
            <div className="field">
              <label htmlFor="businessName">Business name</label>
              <input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="businessAddress">Business address</label>
              <input
                id="businessAddress"
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="businessPhone">Business phone</label>
              <input id="businessPhone" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="bio">About your business</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="A short description consumers will see on your listings"
                style={{
                  minHeight: 90,
                  padding: '0.7rem 0.9rem',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  font: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {vendorProfile && (
              <div className="field">
                <label>Approval status</label>
                <span className={`status-pill status-${vendorProfile.status === 'APPROVED' ? 'confirmed' : 'pending'}`}>
                  {vendorProfile.status}
                </span>
              </div>
            )}

            {businessError && (
              <p className="form-error" role="alert">
                {businessError}
              </p>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingBusiness}>
              {savingBusiness ? 'Saving…' : 'Save business profile'}
            </button>
            {businessSaved && (
              <p className="form-hint" aria-live="polite">
                Saved.
              </p>
            )}
          </form>
        </section>
      )}

      <section className="card settings-section">
        <h2>Notifications</h2>
        <p className="hero-card-sub">Synced to your account across web and mobile.</p>

        <div className="settings-row">
          <div>
            <strong>Push notifications</strong>
            <p className="hero-card-sub">Order updates and refill reminders on your device.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={pushEnabled}
              onChange={(e) => handlePrefChange({ pushEnabled: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="sr-only">Push notifications</span>
          </label>
        </div>

        <div className="settings-row">
          <div>
            <strong>Email notifications</strong>
            <p className="hero-card-sub">Refill reminders and order updates by email.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={emailNotifEnabled}
              onChange={(e) => handlePrefChange({ emailNotifEnabled: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="sr-only">Email notifications</span>
          </label>
        </div>

        <div className="settings-row">
          <div>
            <strong>SMS alerts</strong>
            <p className="hero-card-sub">Text message alerts for critical gas level changes.</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={smsAlertsEnabled}
              onChange={(e) => handlePrefChange({ smsAlertsEnabled: e.target.checked })}
            />
            <span className="switch-track" aria-hidden="true" />
            <span className="sr-only">SMS alerts</span>
          </label>
        </div>

        <div className="field" style={{ marginTop: '1rem', marginBottom: 0 }}>
          <label htmlFor="unit">Measurement units</label>
          <select
            id="unit"
            value={unitPreference}
            onChange={(e) => handlePrefChange({ unitPreference: e.target.value as 'KG' | 'LBS' })}
          >
            <option value="KG">Kilograms (kg)</option>
            <option value="LBS">Pounds (lbs)</option>
          </select>
        </div>

        {prefsSaved && (
          <p className="form-hint" aria-live="polite">
            Saved.
          </p>
        )}
      </section>

      <section className="card settings-section settings-danger">
        <h2>Session</h2>
        <p className="hero-card-sub">Sign out of 4FG Smart Gas Monitor on this device.</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await logout();
            router.push('/');
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
