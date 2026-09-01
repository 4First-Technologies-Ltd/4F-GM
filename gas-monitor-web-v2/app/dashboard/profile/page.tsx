'use client';

import { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorProfile, ApiRequestError } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { AlertCircle, Check } from 'lucide-react';

const STATUS_BADGE_CLASS: Record<string, string> = {
  APPROVED: 'bg-green-100/50 text-green-700',
  PENDING: 'bg-amber-100/50 text-amber-700',
  REJECTED: 'bg-red-100/50 text-red-700'
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
      setTimeout(() => setProfileSaved(false), 3000);
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
      setTimeout(() => setBusinessSaved(false), 3000);
    } catch (err) {
      setBusinessError(err instanceof ApiRequestError ? err.message : 'Could not save your business profile.');
    } finally {
      setSavingBusiness(false);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Section */}
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">Profile</h2>
        <p className="text-sm text-muted-foreground mb-6">Update your name and phone number.</p>

        <form onSubmit={handleProfileSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full name"
              id="name"
              type="text"
              value={name}
              onChange={setName}
              error={false}
              required
              classNames={{ root: 'w-full' }}
            />
            <Input
              label="Phone number"
              id="phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              error={false}
              placeholder="Optional"
              classNames={{ root: 'w-full' }}
            />
          </div>

          <div>
            <Input
              label="Email address"
              id="email"
              type="email"
              value={user.email}
              disabled
              error={false}
              classNames={{ root: 'w-full' }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Contact support to change your email address.
            </p>
          </div>

          {profileError && (
            <div
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>{profileError}</div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save profile'}
            </Button>
            {profileSaved && (
              <span className="flex items-center gap-2 text-xs text-green-700 font-medium">
                <Check className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </form>

        {/* Account Info */}
        <div className="mt-8 pt-6 border-t border-border">
          <dl className="space-y-3">
            <div className="flex justify-between items-start">
              <dt className="text-sm font-medium text-muted-foreground">Account type</dt>
              <dd className="text-sm font-medium text-foreground">
                {user.role === 'VENDOR' ? 'Vendor' : 'Consumer'}
              </dd>
            </div>
            <div className="flex justify-between items-start">
              <dt className="text-sm font-medium text-muted-foreground">Member since</dt>
              <dd className="text-sm font-medium text-foreground">
                {new Date(user.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Business Profile Section (Vendors Only) */}
      {user.role === 'VENDOR' && (
        <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
          <h2 className="text-xl font-semibold text-foreground mb-2">Business profile</h2>
          <p className="text-sm text-muted-foreground mb-6">Shown to consumers browsing the marketplace.</p>

          <form onSubmit={handleBusinessSubmit} noValidate className="space-y-4">
            {/* Logo Upload */}
            <div className="flex items-start gap-4">
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center text-sm font-semibold flex-shrink-0 bg-primary/10 text-primary"
                aria-hidden="true"
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  businessName.slice(0, 2).toUpperCase() || 'BZ'
                )}
              </div>
              <div>
                <label htmlFor="logo" className="inline-block px-3 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg hover:bg-muted/80 transition-colors cursor-pointer">
                  Change logo
                </label>
                <input
                  id="logo"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="hidden"
                />
              </div>
            </div>

            <Input
              label="Business name"
              id="businessName"
              type="text"
              value={businessName}
              onChange={setBusinessName}
              error={false}
              required
              classNames={{ root: 'w-full' }}
            />

            <Input
              label="Business address"
              id="businessAddress"
              type="text"
              value={businessAddress}
              onChange={setBusinessAddress}
              error={false}
              required
              classNames={{ root: 'w-full' }}
            />

            <Input
              label="Business phone"
              id="businessPhone"
              type="tel"
              value={businessPhone}
              onChange={setBusinessPhone}
              error={false}
              required
              classNames={{ root: 'w-full' }}
            />

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-foreground mb-2">
                About your business
              </label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="A short description consumers will see on your listings"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors resize-vertical"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {bio.length}/500 characters
              </p>
            </div>

            {vendorProfile && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Approval status
                </label>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE_CLASS[vendorProfile.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {vendorProfile.status}
                </span>
              </div>
            )}

            {businessError && (
              <div
                className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>{businessError}</div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={savingBusiness}
              >
                {savingBusiness ? 'Saving…' : 'Save business profile'}
              </Button>
              {businessSaved && (
                <span className="flex items-center gap-2 text-xs text-green-700 font-medium">
                  <Check className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
