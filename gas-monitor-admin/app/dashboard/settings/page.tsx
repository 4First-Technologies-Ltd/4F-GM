'use client';

import { useEffect, useState, FormEvent } from 'react';
import { useAdminSession } from '@/lib/admin-session-context';

interface PlatformSettings {
  maintenanceMode: boolean;
  allowVendorSignups: boolean;
  supportEmail: string | null;
  platformFeePercent: number;
}

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';
  isActive: boolean;
  createdAt: string;
}

export default function SettingsPage() {
  const { role } = useAdminSession();
  const canEditSettings = role === 'SUPER_ADMIN' || role === 'OPERATIONS';

  return (
    <>
      <h1>Settings</h1>

      <PlatformSettingsCard canEdit={canEditSettings} />

      {role === 'SUPER_ADMIN' && <SubAdminsCard />}
    </>
  );
}

function PlatformSettingsCard({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [supportEmail, setSupportEmail] = useState('');
  const [feePercent, setFeePercent] = useState('0');
  const [saved, setSaved] = useState(false);

  function load() {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        setSettings(data.settings);
        setSupportEmail(data.settings.supportEmail ?? '');
        setFeePercent(String(data.settings.platformFeePercent));
      });
  }

  useEffect(load, []);

  async function patch(payload: Partial<PlatformSettings>) {
    setSaved(false);
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      setSettings(data.settings);
      setSaved(true);
    }
  }

  async function handleDetailsSubmit(e: FormEvent) {
    e.preventDefault();
    await patch({ supportEmail: supportEmail || null, platformFeePercent: Number(feePercent) });
  }

  if (!settings) return <p className="loading-state">Loading…</p>;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Platform settings</h2>

      <div className="settings-row">
        <div>
          <strong>Maintenance mode</strong>
          <p>Show a maintenance notice and block new orders across the platform.</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.maintenanceMode}
            disabled={!canEdit}
            onChange={(e) => patch({ maintenanceMode: e.target.checked })}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>

      <div className="settings-row">
        <div>
          <strong>Allow new vendor signups</strong>
          <p>Turn off to temporarily stop new vendors from registering.</p>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.allowVendorSignups}
            disabled={!canEdit}
            onChange={(e) => patch({ allowVendorSignups: e.target.checked })}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>

      <form onSubmit={handleDetailsSubmit} style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="supportEmail">Support email</label>
          <input
            id="supportEmail"
            type="email"
            value={supportEmail}
            disabled={!canEdit}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@4fgmonitor.app"
          />
        </div>
        <div className="field">
          <label htmlFor="feePercent">Platform fee (%)</label>
          <input
            id="feePercent"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={feePercent}
            disabled={!canEdit}
            onChange={(e) => setFeePercent(e.target.value)}
          />
        </div>
        {canEdit && (
          <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>
            Save
          </button>
        )}
        {saved && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }} aria-live="polite">
            Saved.
          </p>
        )}
      </form>
    </div>
  );
}

function SubAdminsCard() {
  const [admins, setAdmins] = useState<AdminUserRow[] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'OPERATIONS' | 'SUPPORT'>('OPERATIONS');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch('/api/admin-users')
      .then((res) => res.json())
      .then((data) => setAdmins(data.adminUsers));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Could not create admin.');
        return;
      }
      setName('');
      setEmail('');
      setPassword('');
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      await fetch(`/api/admin-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin-users/${id}`, { method: 'DELETE' });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Sub-admins</h2>
      <p className="subtitle" style={{ margin: '0 0 12px' }}>
        Operations and support staff with scoped access — they can't manage settings or other admins.
      </p>

      <form onSubmit={handleCreate} style={{ marginBottom: 16 }}>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="admin-name">Name</label>
            <input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="admin-password">Temporary password</label>
            <input
              id="admin-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="admin-role">Role</label>
            <select id="admin-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
              <option value="OPERATIONS">Operations</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={submitting}>
          {submitting ? 'Creating…' : 'Create sub-admin'}
        </button>
      </form>

      {!admins ? (
        <p className="loading-state">Loading…</p>
      ) : admins.length === 0 ? (
        <p className="empty-state">No sub-admins yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.email}</td>
                <td>
                  <span className="admin-role-badge">{a.role}</span>
                </td>
                <td>
                  <span className={`badge badge-${a.isActive ? 'approved' : 'rejected'}`}>
                    {a.isActive ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      style={{ background: 'var(--border)', color: 'var(--text)' }}
                      disabled={busyId === a.id}
                      onClick={() => toggleActive(a.id, a.isActive)}
                    >
                      {a.isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-reject"
                      disabled={busyId === a.id}
                      onClick={() => handleDelete(a.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
