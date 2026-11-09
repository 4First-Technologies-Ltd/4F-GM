'use client';

import { useState } from 'react';
import { Modal } from '@/admin/primitives/dialog';
import { Can } from '@/admin/permissions/use-permission';
import { adminUsersModule } from '@/admin/modules/admin-users';

const ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super admin — everything, including managing admins' },
  { value: 'OPERATIONS', label: 'Operations — can change platform data' },
  { value: 'SUPPORT', label: 'Support — read-only' },
  { value: 'SOCIAL', label: 'Social media team — Social media operations only' }
];

const SMOS_ROLES = [
  { value: 'MANAGER', label: 'Social media manager — creates content, works tasks' },
  { value: 'REVIEWER', label: 'Content reviewer — approves or rejects content' },
  { value: 'MANAGEMENT', label: 'Management — full visibility, assigns and approves' },
  { value: 'VIEWER', label: 'Read-only — dashboards and reports' }
];

/**
 * Creates a named admin so every audit entry traces to one person. Each person
 * gets their own email + password; never share a login.
 */
export function AddAdminButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OPERATIONS', smosRole: 'MANAGER' });

  function close() {
    setOpen(false);
    setError(null);
    setForm({ name: '', email: '', password: '', role: 'OPERATIONS', smosRole: 'MANAGER' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Only a social media team member needs an SMOIS role chosen up front.
      await adminUsersModule.data.create!({ ...form, smosRole: form.role === 'SOCIAL' ? form.smosRole : undefined });
      close();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Can permission="admins.create">
      <button type="button" className="adm-btn adm-btn--primary" onClick={() => setOpen(true)}>
        Add admin
      </button>
      {open && (
        <Modal title="Add admin" onClose={close}>
          <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <label className="adm-field">
              <span className="adm-field-label">Full name</span>
              <input className="adm-input" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Email (their login)</span>
              <input className="adm-input" type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Temporary password</span>
              <input className="adm-input" type="password" required minLength={8} autoComplete="new-password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Role</span>
              <select className="adm-input" value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            {form.role === 'SOCIAL' && (
              <label className="adm-field">
                <span className="adm-field-label">Social media role</span>
                <select className="adm-input" value={form.smosRole}
                  onChange={(e) => setForm({ ...form, smosRole: e.target.value })}>
                  {SMOS_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>
            )}
            {error && <p className="adm-field-error">{error}</p>}
            <div className="adm-dialog-actions">
              <button type="button" className="adm-btn" onClick={close} disabled={busy}>Cancel</button>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
                {busy ? 'Creating…' : 'Create admin'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Can>
  );
}
