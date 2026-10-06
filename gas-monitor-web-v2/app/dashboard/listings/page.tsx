'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, GasListing, GasType } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { AlertCircle } from 'lucide-react';

const GAS_TYPES: GasType[] = ['COOKING', 'MEDICAL', 'INDUSTRIAL', 'BULK', 'OTHER'];
const GAS_TYPE_LABEL: Record<GasType, string> = {
  COOKING: 'Cooking gas',
  MEDICAL: 'Medical gas',
  INDUSTRIAL: 'Industrial gas',
  BULK: 'Bulk gas',
  OTHER: 'Other'
};
const SIZE_OPTIONS = ['6kg', '12.5kg', '50kg'];

export default function ListingsPage() {
  const { user } = useAuth();
  const [listings, setListings] = useState<GasListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [gasType, setGasType] = useState<GasType>('COOKING');
  const [customName, setCustomName] = useState('');
  const [pricePerKg, setPricePerKg] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isVendor = user?.role === 'VENDOR';

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setListings(await vendorApi.getListings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load listings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVendor) loadListings();
  }, [isVendor, loadListings]);

  function toggleSize(size: string) {
    setSizes((current) => (current.includes(size) ? current.filter((s) => s !== size) : [...current, size]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const price = Number(pricePerKg);
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Enter a price per kg greater than zero.');
      return;
    }
    if (sizes.length === 0) {
      setFormError('Select at least one cylinder size.');
      return;
    }
    setSubmitting(true);
    try {
      const listing = await vendorApi.createListing({
        gasType,
        customName: customName.trim() || undefined,
        pricePerKg: price,
        cylinderSizes: sizes
      });
      setListings((current) => [listing, ...current]);
      setCustomName('');
      setPricePerKg('');
      setSizes([]);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create listing.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStock(listing: GasListing) {
    setBusyId(listing.id);
    setError(null);
    try {
      const updated = await vendorApi.updateListing(listing.id, { inStock: !listing.inStock });
      setListings((current) => current.map((l) => (l.id === listing.id ? updated : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update listing.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeListing(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await vendorApi.deleteListing(id);
      setListings((current) => current.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete listing.');
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  if (!isVendor) return null;

  const notApproved = user.vendorStatus !== 'APPROVED';

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8 h-fit">
        <h2 className="text-xl font-semibold text-foreground mb-2">Add a listing</h2>
        {notApproved ? (
          <p className="text-sm text-muted-foreground">Listings can be created once your vendor account is approved.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">Consumers see these in the marketplace.</p>
            <form onSubmit={handleCreate} noValidate className="space-y-4">
              <div>
                <label htmlFor="gasType" className="block text-sm font-medium text-foreground mb-2">
                  Gas type
                </label>
                <select
                  id="gasType"
                  value={gasType}
                  onChange={(e) => setGasType(e.target.value as GasType)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  {GAS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {GAS_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Listing name (optional)"
                id="customName"
                type="text"
                value={customName}
                onChange={setCustomName}
                error={false}
                classNames={{ root: 'w-full' }}
              />

              <Input
                label="Price per kg (₦)"
                id="pricePerKg"
                type="number"
                min={1}
                step="0.01"
                value={pricePerKg}
                onChange={setPricePerKg}
                error={false}
                required
                classNames={{ root: 'w-full' }}
              />

              <div>
                <span className="block text-sm font-medium text-foreground mb-2">Cylinder sizes</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Cylinder sizes">
                  {SIZE_OPTIONS.map((size) => {
                    const active = sizes.includes(size);
                    return (
                      <button
                        key={size}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleSize(size)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <div
                  className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
                  role="alert"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>{formError}</div>
                </div>
              )}

              <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                {submitting ? 'Adding…' : 'Add listing'}
              </Button>
            </form>
          </>
        )}
      </div>

      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-6">Your listings</h2>

        {error && (
          <div
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2 mb-4"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading listings…</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="text-sm text-muted-foreground">No listings yet — add your first one.</p>
        )}

        {listings.length > 0 && (
          <ul className="divide-y divide-border -my-4">
            {listings.map((listing) => (
              <li key={listing.id} className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{listing.customName || GAS_TYPE_LABEL[listing.gasType]}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatNaira(listing.pricePerKg)}/kg · {listing.cylinderSizes.join(', ')}
                    </p>
                  </div>
                  <span
                    className={`inline-flex flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                      listing.inStock ? 'bg-green-100/50 text-green-700' : 'bg-red-100/50 text-red-700'
                    }`}
                  >
                    {listing.inStock ? 'In stock' : 'Out of stock'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busyId === listing.id}
                    onClick={() => toggleStock(listing)}
                  >
                    {listing.inStock ? 'Mark out of stock' : 'Mark in stock'}
                  </Button>
                  {confirmDeleteId === listing.id ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={busyId === listing.id}
                        onClick={() => removeListing(listing.id)}
                      >
                        Confirm delete
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busyId === listing.id}
                      onClick={() => setConfirmDeleteId(listing.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
