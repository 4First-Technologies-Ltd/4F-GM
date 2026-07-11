'use client';

import { useEffect, useState, FormEvent } from 'react';
import { addressApi, Address, ApiRequestError } from '@/lib/api';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [label, setLabel] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    addressApi.list().then(setAddresses);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addressApi.create({ label, fullAddress, isDefault: (addresses?.length ?? 0) === 0 });
      setLabel('');
      setFullAddress('');
      load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save this address.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetDefault(id: string) {
    setBusyId(id);
    try {
      await addressApi.update(id, { isDefault: true });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    try {
      await addressApi.remove(id);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="dashboard-grid">
      <div className="card">
        <h2>Add a delivery address</h2>
        <p className="hero-card-sub">Save addresses so checkout is faster next time.</p>
        <form onSubmit={handleAdd} noValidate>
          <div className="field">
            <label htmlFor="label">Label</label>
            <input
              id="label"
              required
              placeholder="Home, Office, etc."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="fullAddress">Full address</label>
            <input
              id="fullAddress"
              required
              minLength={5}
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save address'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Your addresses</h2>
        {!addresses && <p className="hero-card-sub">Loading…</p>}
        {addresses && addresses.length === 0 && <p className="hero-card-sub">No saved addresses yet.</p>}
        {addresses && addresses.length > 0 && (
          <ul className="recent-order-list">
            {addresses.map((a) => (
              <li key={a.id} className="recent-order-row">
                <div>
                  <strong>{a.label}</strong>
                  {a.isDefault && <span className="status-pill status-confirmed" style={{ marginLeft: 8 }}>Default</span>}
                  <span className="hero-card-sub" style={{ display: 'block' }}>
                    {a.fullAddress}
                  </span>
                </div>
                <div className="recent-order-meta">
                  {!a.isDefault && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === a.id}
                      onClick={() => handleSetDefault(a.id)}
                    >
                      Make default
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busyId === a.id}
                    onClick={() => handleRemove(a.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
