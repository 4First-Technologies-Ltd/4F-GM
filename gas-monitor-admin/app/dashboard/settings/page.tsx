'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson, patchJson } from '@/admin/data/source';
import { ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import { ROLE_GRANTS, ROLE_LABEL, type AdminRole } from '@/admin/permissions/permissions';
import type { PlatformSettings } from '@/admin/modules/types';

/**
 * Settings — real, backed by the PlatformSettings singleton.
 *
 * Sections save independently rather than under one page-wide Save, and each
 * shows what it will change. Admin-user management moved out to its own module.
 *
 * The role model is shown READ-ONLY: AdminRole is a hardcoded Prisma enum, not
 * a table, so an editable permission matrix would have nothing to write to.
 * Showing it read-only beats hiding it and leaving operators guessing.
 */

type Draft = Pick<
  PlatformSettings,
  'maintenanceMode' | 'allowVendorSignups' | 'supportEmail' | 'platformFeePercent'
>;

export default function SettingsPage() {
  const canRead = usePermission('settings.read');
  const canEdit = usePermission('settings.update');

  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getJson<{ settings: PlatformSettings }>('/settings')
      .then((r) => {
        setSettings(r.settings);
        setDraft({
          maintenanceMode: r.settings.maintenanceMode,
          allowVendorSignups: r.settings.allowVendorSignups,
          supportEmail: r.settings.supportEmail,
          platformFeePercent: r.settings.platformFeePercent
        });
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  useEffect(load, [load]);

  async function save(section: string, patch: Partial<Draft>) {
    setSaving(section);
    setSaveError(null);
    setSaved(null);
    try {
      const res = await patchJson<{ settings: PlatformSettings }>('/settings', patch);
      setSettings(res.settings);
      setSaved(section);
      window.setTimeout(() => setSaved(null), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  if (!canRead) return <ForbiddenState permission="settings.read" />;

  if (error) {
    return (
      <div className="adm-page">
        <h1 className="adm-page-title">Settings</h1>
        <ErrorState title="Could not load settings" error={error} onRetry={load} />
      </div>
    );
  }

  const dirtyAccess =
    draft && settings
      ? draft.maintenanceMode !== settings.maintenanceMode ||
        draft.allowVendorSignups !== settings.allowVendorSignups
      : false;

  const dirtyCommerce =
    draft && settings
      ? draft.platformFeePercent !== settings.platformFeePercent ||
        (draft.supportEmail ?? '') !== (settings.supportEmail ?? '')
      : false;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Settings</h1>
          <p className="adm-page-meta">Platform configuration. Every change is written to the audit log.</p>
        </div>
      </header>

      {!canEdit && (
        <div className="adm-alert" role="note">
          You have read-only access to settings. Editing requires the Operations role.
        </div>
      )}

      {saveError && (
        <div className="adm-inline-error" role="alert">
          <span>{saveError}</span>
        </div>
      )}

      {!draft || !settings ? (
        <LoadingBlock height={220} />
      ) : (
        <>
          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">Access</h2>

            <div className="adm-switch-row">
              <span className="adm-switch-copy">
                <strong>Maintenance mode</strong>
                <span className="adm-field-help">
                  Takes the consumer app offline. Customers cannot browse or order while this is on.
                </span>
              </span>
              <input
                type="checkbox"
                className="adm-checkbox"
                checked={draft.maintenanceMode}
                disabled={!canEdit}
                aria-label="Maintenance mode"
                onChange={(e) => setDraft({ ...draft, maintenanceMode: e.target.checked })}
              />
            </div>

            <div className="adm-switch-row">
              <span className="adm-switch-copy">
                <strong>Allow vendor signups</strong>
                <span className="adm-field-help">
                  When off, new vendors cannot register. Existing vendors are unaffected.
                </span>
              </span>
              <input
                type="checkbox"
                className="adm-checkbox"
                checked={draft.allowVendorSignups}
                disabled={!canEdit}
                aria-label="Allow vendor signups"
                onChange={(e) => setDraft({ ...draft, allowVendorSignups: e.target.checked })}
              />
            </div>

            {canEdit && (
              <div className="adm-dialog-actions" style={{ marginTop: 'var(--space-4)' }}>
                {saved === 'access' && <span className="adm-badge adm-badge--success">Saved</span>}
                <button
                  type="button"
                  className="adm-btn adm-btn--primary"
                  disabled={!dirtyAccess || saving === 'access'}
                  onClick={() =>
                    save('access', {
                      maintenanceMode: draft.maintenanceMode,
                      allowVendorSignups: draft.allowVendorSignups
                    })
                  }
                >
                  {saving === 'access' ? 'Saving…' : 'Save access settings'}
                </button>
              </div>
            )}
          </section>

          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">Commerce and support</h2>

            <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <label className="adm-field">
                <span className="adm-field-label">Platform fee (%)</span>
                <input
                  type="number"
                  className="adm-input"
                  min={0}
                  max={100}
                  step={0.1}
                  value={draft.platformFeePercent}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setDraft({ ...draft, platformFeePercent: Number(e.target.value) })
                  }
                />
                <span className="adm-field-help">
                  Taken from each confirmed order. Between 0 and 100.
                </span>
              </label>

              <label className="adm-field">
                <span className="adm-field-label">Support email</span>
                <input
                  type="email"
                  className="adm-input"
                  value={draft.supportEmail ?? ''}
                  disabled={!canEdit}
                  placeholder="support@4fgmonitor.com"
                  onChange={(e) => setDraft({ ...draft, supportEmail: e.target.value || null })}
                />
                <span className="adm-field-help">Shown to customers in the consumer app.</span>
              </label>
            </div>

            {canEdit && (
              <div className="adm-dialog-actions" style={{ marginTop: 'var(--space-4)' }}>
                {saved === 'commerce' && <span className="adm-badge adm-badge--success">Saved</span>}
                <button
                  type="button"
                  className="adm-btn adm-btn--primary"
                  disabled={!dirtyCommerce || saving === 'commerce'}
                  onClick={() =>
                    save('commerce', {
                      platformFeePercent: draft.platformFeePercent,
                      supportEmail: draft.supportEmail
                    })
                  }
                >
                  {saving === 'commerce' ? 'Saving…' : 'Save commerce settings'}
                </button>
              </div>
            )}
          </section>

          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">Roles</h2>
            <p className="adm-field-help" style={{ marginTop: 'var(--space-2)' }}>
              Roles are defined in the database schema, not here, so they cannot be edited from the
              console. Manage who holds each role under{' '}
              <Link className="adm-link" href="/dashboard/admin-users" style={{ fontWeight: 600 }}>
                Admin users
              </Link>
              .
            </p>
            <div className="adm-table-scroll" style={{ marginTop: 'var(--space-4)' }}>
              <table className="adm-table">
                <caption className="adm-sr-only">Role permissions</caption>
                <thead>
                  <tr>
                    <th scope="col" className="adm-th">
                      Role
                    </th>
                    <th scope="col" className="adm-th">
                      Can do
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(ROLE_GRANTS) as AdminRole[]).map((role) => (
                    <tr key={role} className="adm-tr">
                      <th scope="row" className="adm-td adm-td--primary">
                        {ROLE_LABEL[role]}
                      </th>
                      <td className="adm-td" style={{ whiteSpace: 'normal' }}>
                        {ROLE_GRANTS[role].includes('*')
                          ? 'Everything, including managing admin accounts'
                          : ROLE_GRANTS[role].join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="adm-field-help">
            Last updated {new Date(settings.updatedAt).toLocaleString('en-NG')}.
          </p>
        </>
      )}
    </div>
  );
}
