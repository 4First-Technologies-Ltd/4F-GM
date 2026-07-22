'use client';

import { useEffect, useState } from 'react';
import Modal from './Modal';
import { adminFetch } from '@/lib/api';

interface VendorProfileDetail {
  id: string;
  businessName: string;
  businessAddress: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  bio: string | null;
  _count: { listings: number; orders: number; documents: number };
}

interface OrderSummary {
  id: string;
  cylinderSize: string;
  quantity: number;
  totalAmount: number;
  status: string;
  createdAt: string;
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'CONSUMER' | 'VENDOR';
  emailVerified: boolean;
  isSuspended: boolean;
  unitPreference: 'KG' | 'LBS';
  createdAt: string;
  vendorProfile: VendorProfileDetail | null;
  addresses: { id: string; label: string; fullAddress: string; isDefault: boolean }[];
  cylinderProfiles: { id: string; name: string; sizeKg: number; isActive: boolean }[];
  orders: OrderSummary[];
  _count: { orders: number };
}

function formatNaira(amount: number) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
}

export default function UserModal({
  userId,
  onClose,
  onChanged
}: {
  userId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const isCreate = userId === null;

  // Create-mode fields
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState<'CONSUMER' | 'VENDOR'>('CONSUMER');

  // Existing-user detail + edit fields
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  const [loading, setLoading] = useState(!isCreate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isCreate) return;
    setLoading(true);
    adminFetch(`/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        const u: UserDetail = data.user;
        setDetail(u);
        setName(u.name);
        setEmail(u.email);
        setPhone(u.phone ?? '');
        setEmailVerified(u.emailVerified);
        setIsSuspended(u.isSuspended);
      })
      .finally(() => setLoading(false));
  }, [userId, isCreate]);

  async function handleCreate() {
    setError(null);
    setSaving(true);
    try {
      const res = await adminFetch('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
          phone: createPhone || null
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not create user.');
        return;
      }
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!userId) return;
    setError(null);
    setSaving(true);
    try {
      const res = await adminFetch(`/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || null, emailVerified, isSuspended })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not save changes.');
        return;
      }
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!userId) return;
    if (!confirm('Delete this user permanently? This cannot be undone.')) return;
    setError(null);
    setSaving(true);
    try {
      const res = await adminFetch(`/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not delete user.');
        return;
      }
      onChanged();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (isCreate) {
    return (
      <Modal
        title="Add user"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn btn-small" style={{ background: 'var(--border)' }} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-small btn-approve" disabled={saving} onClick={handleCreate}>
              {saving ? 'Creating…' : 'Create user'}
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="create-name">Name</label>
          <input id="create-name" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="create-email">Email</label>
          <input
            id="create-email"
            type="email"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="create-password">Temporary password</label>
          <input
            id="create-password"
            type="password"
            minLength={8}
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="create-phone">Phone (optional)</label>
          <input id="create-phone" value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="create-role">Role</label>
          <select id="create-role" value={createRole} onChange={(e) => setCreateRole(e.target.value as typeof createRole)}>
            <option value="CONSUMER">Consumer</option>
            <option value="VENDOR">Vendor</option>
          </select>
        </div>
        {createRole === 'VENDOR' && (
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            This creates the account only — the vendor still needs to complete their business profile from Vendors.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal
      title="User details"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-small btn-reject" disabled={saving || loading} onClick={handleDelete}>
            Delete
          </button>
          <button type="button" className="btn btn-small btn-approve" disabled={saving || loading} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      {loading || !detail ? (
        <p className="loading-state">Loading…</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="edit-email">Email</label>
            <input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="edit-phone">Phone</label>
            <input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Not set" />
          </div>

          <div className="settings-row">
            <div>
              <strong>Email verified</strong>
            </div>
            <label className="switch">
              <input type="checkbox" checked={emailVerified} onChange={(e) => setEmailVerified(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>
          <div className="settings-row">
            <div>
              <strong>Suspended</strong>
              <p>Suspended accounts cannot sign in.</p>
            </div>
            <label className="switch">
              <input type="checkbox" checked={isSuspended} onChange={(e) => setIsSuspended(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
            </label>
          </div>

          <dl className="detail-list" style={{ marginTop: 16 }}>
            <div>
              <dt>Role</dt>
              <dd>{detail.role}</dd>
            </div>
            <div>
              <dt>Units</dt>
              <dd>{detail.unitPreference}</dd>
            </div>
            <div>
              <dt>Total orders</dt>
              <dd>{detail._count.orders}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{new Date(detail.createdAt).toLocaleDateString()}</dd>
            </div>
          </dl>

          {detail.vendorProfile && (
            <>
              <p className="modal-section-title">Vendor profile</p>
              <dl className="detail-list">
                <div>
                  <dt>Business</dt>
                  <dd>{detail.vendorProfile.businessName}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{detail.vendorProfile.businessAddress}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span className={`badge badge-${detail.vendorProfile.status.toLowerCase()}`}>
                      {detail.vendorProfile.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Listings / Orders / Documents</dt>
                  <dd>
                    {detail.vendorProfile._count.listings} / {detail.vendorProfile._count.orders} /{' '}
                    {detail.vendorProfile._count.documents}
                  </dd>
                </div>
              </dl>
            </>
          )}

          {detail.addresses.length > 0 && (
            <>
              <p className="modal-section-title">Addresses</p>
              <dl className="detail-list">
                {detail.addresses.map((a) => (
                  <div key={a.id}>
                    <dt>{a.label}{a.isDefault ? ' (default)' : ''}</dt>
                    <dd>{a.fullAddress}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {detail.cylinderProfiles.length > 0 && (
            <>
              <p className="modal-section-title">Cylinder profiles</p>
              <dl className="detail-list">
                {detail.cylinderProfiles.map((c) => (
                  <div key={c.id}>
                    <dt>{c.name}{c.isActive ? ' (active)' : ''}</dt>
                    <dd>{c.sizeKg}kg</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {detail.orders.length > 0 && (
            <>
              <p className="modal-section-title">Recent orders</p>
              <table>
                <thead>
                  <tr>
                    <th>Cylinder</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        {o.cylinderSize} × {o.quantity}
                      </td>
                      <td>{formatNaira(o.totalAmount)}</td>
                      <td>
                        <span className={`badge badge-${o.status.toLowerCase()}`}>{o.status}</span>
                      </td>
                      <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {error && (
            <p className="error-text" style={{ marginTop: 12 }}>
              {error}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
