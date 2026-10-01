'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { riderApi, RiderProfile } from '@/lib/api';
import { Button } from '@/components/motion/button/base';
import { RiderDetailsFields } from './RiderDetailsFields';

const STATUS_BADGE_CLASS: Record<string, string> = {
  APPROVED: 'bg-green-100/50 text-green-700',
  PENDING: 'bg-amber-100/50 text-amber-700',
  REJECTED: 'bg-red-100/50 text-red-700'
};

/** Profile-page card for the rider's phone, vehicle and plate. */
export function RiderDetailsSection() {
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    riderApi
      .getProfile()
      .then((p) => {
        setProfile(p);
        setPhone(p.phone);
        setVehicleType(p.vehicleType ?? '');
        setPlateNumber(p.plateNumber ?? '');
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) {
      setError('Phone number is required.');
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const updated = await riderApi.updateProfile({
        phone: phone.trim(),
        vehicleType: vehicleType || undefined,
        plateNumber: plateNumber.trim() || undefined
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rider details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
      <h2 className="text-xl font-semibold text-foreground mb-2">Rider details</h2>
      <p className="text-sm text-muted-foreground mb-6">Shown to vendors who assign you deliveries.</p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <RiderDetailsFields
          phone={phone}
          vehicleType={vehicleType}
          plateNumber={plateNumber}
          onPhoneChange={setPhone}
          onVehicleTypeChange={setVehicleType}
          onPlateNumberChange={setPlateNumber}
          disabled={saving}
        />

        {profile && (
          <div>
            <span className="block text-sm font-medium text-foreground mb-2">Approval status</span>
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                STATUS_BADGE_CLASS[profile.status] ?? 'bg-muted text-muted-foreground'
              }`}
            >
              {profile.status}
            </span>
          </div>
        )}

        {error && (
          <div
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save rider details'}
          </Button>
          {saved && (
            <span className="flex items-center gap-2 text-xs text-green-700 font-medium">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
