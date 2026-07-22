'use client';

import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorProfile, ApiRequestError } from '@/lib/api';

const STATUS_CLASS: Record<string, string> = {
  APPROVED: 'status-confirmed',
  PENDING: 'status-pending',
  REJECTED: 'status-cancelled'
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [bio, setBio] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessSaved, setBusinessSaved] = useState(false);
  const [businessError, setBusinessError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone ?? '');
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
        setLogoUrl(profile.logoUrl ?? null);
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

  async function handleLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    setLogoUrl(dataUrl);
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
        bio: bio || null,
        logoUrl: logoUrl || null
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
            <div className="profile-logo-row">
              <span className="profile-logo" aria-hidden="true">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" />
                ) : (
                  businessName.slice(0, 2).toUpperCase() || 'BZ'
                )}
              </span>
              <div>
                <label htmlFor="logo" className="btn btn-secondary btn-sm">
                  Change logo
                </label>
                <input id="logo" type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
              </div>
            </div>

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
                <span className={`status-pill ${STATUS_CLASS[vendorProfile.status] ?? 'status-pending'}`}>
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
    </div>
  );
}
