'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, GasListing, GasType } from '@/lib/api';
import { formatNaira } from '@/lib/format';

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

  async function loadListings() {
    setLoading(true);
    setError(null);
    try {
      const data = await vendorApi.getListings();
      setListings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load listings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadListings();
  }, []);

  function toggleSize(size: string) {
    setSizes((current) => (current.includes(size) ? current.filter((s) => s !== size) : [...current, size]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (sizes.length === 0) {
      setFormError('Select at least one cylinder size.');
      return;
    }
    setSubmitting(true);
    try {
      const listing = await vendorApi.createListing({
        gasType,
        customName: customName.trim() || undefined,
        pricePerKg: Number(pricePerKg),
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
    try {
      const updated = await vendorApi.updateListing(listing.id, { inStock: !listing.inStock });
      setListings((current) => current.map((l) => (l.id === listing.id ? updated : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update listing.');
    }
  }

  async function removeListing(id: string) {
    try {
      await vendorApi.deleteListing(id);
      setListings((current) => current.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete listing.');
    }
  }

  const notApproved = user?.role === 'VENDOR' && user.vendorStatus !== 'APPROVED';

  return (
    <section className="dashboard-grid">
      <div className="card dashboard-order-form">
        <h2>Add a listing</h2>
        {notApproved ? (
          <p className="hero-card-sub">Listings can be created once your vendor account is approved.</p>
        ) : (
          <form onSubmit={handleCreate} noValidate>
            <div className="field">
              <label htmlFor="gasType">Gas type</label>
              <select id="gasType" value={gasType} onChange={(e) => setGasType(e.target.value as GasType)}>
                {GAS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {GAS_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="customName">Listing name (optional)</label>
              <input id="customName" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pricePerKg">Price per kg (₦)</label>
              <input
                id="pricePerKg"
                type="number"
                min={1}
                step="0.01"
                required
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Cylinder sizes</label>
              <div className="order-filter-tabs">
                {SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={`pill${sizes.includes(size) ? ' pill-active' : ''}`}
                    onClick={() => toggleSize(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {formError && (
              <p className="form-error" role="alert" aria-live="polite">
                {formError}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting ? 'Adding…' : 'Add listing'}
            </button>
          </form>
        )}
      </div>

      <div className="card dashboard-orders">
        <div className="dashboard-card-head">
          <h2>Your listings</h2>
        </div>
        {loading && <p className="hero-card-sub">Loading listings…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!loading && listings.length === 0 && <p className="hero-card-sub">No listings yet — add your first one.</p>}
        {listings.length > 0 && (
          <ul className="recent-order-list">
            {listings.map((listing) => (
              <li key={listing.id} className="recent-order-row">
                <div>
                  <strong>{listing.customName || GAS_TYPE_LABEL[listing.gasType]}</strong>
                  <span className="hero-card-sub">
                    {formatNaira(listing.pricePerKg)}/kg · {listing.cylinderSizes.join(', ')}
                  </span>
                </div>
                <div className="recent-order-meta">
                  <span className={`status-pill ${listing.inStock ? 'status-confirmed' : 'status-cancelled'}`}>
                    {listing.inStock ? 'In stock' : 'Out of stock'}
                  </span>
                  <div className="hero-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleStock(listing)}>
                      {listing.inStock ? 'Mark out of stock' : 'Mark in stock'}
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeListing(listing.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
