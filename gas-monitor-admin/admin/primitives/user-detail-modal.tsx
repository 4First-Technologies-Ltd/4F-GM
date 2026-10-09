'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { ErrorState, LoadingState } from '@/admin/primitives/states';
import { getJson } from '@/admin/data/source';
import {
  formatDate,
  formatDateTime,
  formatNaira,
  formatNumber,
  formatRelative,
  humaniseEnum,
  shortId
} from '@/admin/primitives/format';
import { CrmPanel } from '@/admin/primitives/crm-panel';
import type { UserDetail } from '@/admin/modules/types';

const PLAN_NAMES = { BASIC: 'Basic (5%)', GROWTH: 'Growth (7%)', PRO: 'Pro / Premium (10%)' } as const;

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={`adm-detail-field${full ? ' adm-detail-field--full' : ''}`}>
      <dt className="adm-micro-label">{label}</dt>
      <dd className="adm-detail-field-value">{empty ? '—' : children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="adm-detail-section">
      <h3 className="adm-micro-label">{title}</h3>
      {children}
    </section>
  );
}

const yesNo = (v: boolean) => (v ? 'On' : 'Off');
const coords = (lat: number | null, lng: number | null) => (lat != null && lng != null ? `${lat}, ${lng}` : null);

/**
 * Full-detail modal for any account (consumer, vendor or rider). Fetches the
 * complete record from `GET /users/:id` rather than trusting the trimmed list
 * row. `footer` carries the owning list's row actions.
 */
export function UserDetailModal({
  userId,
  onClose,
  footer
}: {
  userId: string;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setUser(null);
    setError(null);
    getJson<{ user: UserDetail }>(`/users/${userId}`, { signal: ctrl.signal })
      .then((b) => setUser(b.user))
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => ctrl.abort();
  }, [userId, attempt]);

  const v = user?.vendorProfile;
  const r = user?.riderProfile;

  return (
    <Modal title={user?.name ?? 'User details'} onClose={onClose} wide footer={footer}>
      {error && <ErrorState title="Could not load this user" error={error} onRetry={() => setAttempt((n) => n + 1)} />}
      {!user && !error && <LoadingState rows={6} columns={2} />}

      {user && (
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge value={user.role} />
            <StatusBadge value={user.isSuspended ? 'SUSPENDED' : 'ACTIVE'} />
            <StatusBadge value={user.emailVerified ? 'VERIFIED' : 'UNVERIFIED'} />
            <span className="adm-muted">ID {shortId(user.id)}</span>
          </div>

          <Section title="Account">
            <dl className="adm-detail-fields">
              <Field label="Name">{user.name}</Field>
              <Field label="Email">{user.email}</Field>
              <Field label="Phone">{user.phone}</Field>
              <Field label="Device phone">{user.devicePhone}</Field>
              <Field label="Joined">{formatDateTime(user.createdAt)}</Field>
              <Field label="Last updated">{formatDateTime(user.updatedAt)}</Field>
              <Field label="Push notifications">{yesNo(user.pushEnabled)}</Field>
              <Field label="Email notifications">{yesNo(user.emailNotifEnabled)}</Field>
              <Field label="SMS alerts">{yesNo(user.smsAlertsEnabled)}</Field>
              <Field label="Unit preference">{humaniseEnum(user.unitPreference)}</Field>
              <Field label="Full ID" full>
                <code>{user.id}</code>
              </Field>
            </dl>
          </Section>

          {v && (
            <Section title="Vendor profile">
              <dl className="adm-detail-fields">
                <Field label="Business">{v.businessName}</Field>
                <Field label="Status">
                  <StatusBadge value={v.status} />
                </Field>
                <Field label="Business phone">{v.phone}</Field>
                <Field label="Plan">{PLAN_NAMES[v.plan]}</Field>
                <Field label="State">{v.state}</Field>
                <Field label="City">{v.city}</Field>
                <Field label="Address" full>
                  {v.businessAddress}
                </Field>
                <Field label="Bio" full>
                  {v.bio}
                </Field>
                <Field label="Coordinates">{coords(v.lat, v.lng)}</Field>
                <Field label="Registered">{formatDate(v.createdAt)}</Field>
                <Field label="Plan last changed">{v.planChangedAt ? formatDate(v.planChangedAt) : null}</Field>
                <Field label="Plan cooldown ends">
                  {v.planLockedUntil && new Date(v.planLockedUntil) > new Date()
                    ? formatDate(v.planLockedUntil)
                    : null}
                </Field>
                <Field label="Listings">{formatNumber(v._count.listings)}</Field>
                <Field label="Orders received">{formatNumber(v._count.orders)}</Field>
                <Field label="Logo" full>
                  {v.logoUrl ? (
                    <a href={v.logoUrl} target="_blank" rel="noopener noreferrer">
                      Open logo
                    </a>
                  ) : null}
                </Field>
              </dl>

              <h4 className="adm-micro-label">Documents ({v.documents.length})</h4>
              {v.documents.length === 0 ? (
                <p className="adm-muted">No documents uploaded.</p>
              ) : (
                <ul className="adm-doc-list">
                  {v.documents.map((d) => (
                    <li key={d.id} className="adm-doc-item">
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {d.fileName}
                        <span className="adm-td-sub">Uploaded {formatDate(d.createdAt)}</span>
                      </span>
                      <a
                        className="adm-btn adm-btn--sm"
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${d.fileName} in a new tab`}
                      >
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="adm-micro-label">Plan history ({v.planChanges.length})</h4>
              {v.planChanges.length === 0 ? (
                <p className="adm-muted">No plan changes — still on the plan chosen at sign-up.</p>
              ) : (
                <ul className="adm-doc-list">
                  {v.planChanges.map((c) => (
                    <li key={c.id} className="adm-doc-item">
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {PLAN_NAMES[c.fromPlan]} → {PLAN_NAMES[c.toPlan]}
                        <span className="adm-td-sub">
                          {c.actor === 'ADMIN'
                            ? `by ${c.actorName ?? 'an operator'}${c.actorEmail ? ` (${c.actorEmail})` : ''}`
                            : 'by the vendor'}
                          {c.bypassedCooldown ? ' · cooldown overridden' : ''}
                        </span>
                      </span>
                      <span className="adm-muted" title={formatDateTime(c.createdAt)}>
                        {formatRelative(c.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {r && (
            <Section title="Rider profile">
              <dl className="adm-detail-fields">
                <Field label="Status">
                  <StatusBadge value={r.status} />
                </Field>
                <Field label="Phone">{r.phone}</Field>
                <Field label="Vehicle type">{r.vehicleType}</Field>
                <Field label="Plate number">{r.plateNumber}</Field>
                <Field label="Last known location">{coords(r.lat, r.lng)}</Field>
                <Field label="Registered">{formatDate(r.createdAt)}</Field>
                <Field label="Orders assigned">{formatNumber(r._count.orders)}</Field>
              </dl>

              <h4 className="adm-micro-label">Recent deliveries ({r.orders.length})</h4>
              {r.orders.length === 0 ? (
                <p className="adm-muted">No orders assigned yet.</p>
              ) : (
                <ul className="adm-doc-list">
                  {r.orders.map((o) => (
                    <li key={o.id} className="adm-doc-item">
                      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {o.deliveryAddress}
                        <span className="adm-td-sub">
                          <StatusBadge value={o.status} />
                        </span>
                      </span>
                      <span className="adm-muted" title={formatDateTime(o.assignedAt ?? o.createdAt)}>
                        {formatRelative(o.assignedAt ?? o.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          <Section title="Orders placed">
            <dl className="adm-detail-fields">
              <Field label="Total orders">{formatNumber(user._count.orders)}</Field>
              <Field label="Total spend">{formatNaira(user.totalSpend)}</Field>
            </dl>
            {user.orders.length === 0 ? (
              <p className="adm-muted">This account has not placed any orders.</p>
            ) : (
              <ul className="adm-doc-list">
                {user.orders.map((o) => (
                  <li key={o.id} className="adm-doc-item">
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {o.quantity} × {o.cylinderSize} · {formatNaira(o.totalAmount)}
                      <span className="adm-td-sub">
                        {o.supplierName ? `${o.supplierName} · ` : ''}
                        {o.deliveryAddress}
                      </span>
                      <span className="adm-td-sub">
                        <StatusBadge value={o.status} />
                      </span>
                    </span>
                    <span className="adm-muted" title={formatDateTime(o.createdAt)}>
                      {formatRelative(o.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Saved addresses (${user.addresses.length})`}>
            {user.addresses.length === 0 ? (
              <p className="adm-muted">No saved addresses.</p>
            ) : (
              <ul className="adm-doc-list">
                {user.addresses.map((a) => (
                  <li key={a.id} className="adm-doc-item">
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      {a.label}
                      <span className="adm-td-sub">{a.fullAddress}</span>
                    </span>
                    {a.isDefault && <span className="adm-muted">Default</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Cylinder profiles (${user.cylinderProfiles.length})`}>
            {user.cylinderProfiles.length === 0 ? (
              <p className="adm-muted">No cylinder profiles.</p>
            ) : (
              <ul className="adm-doc-list">
                {user.cylinderProfiles.map((c) => (
                  <li key={c.id} className="adm-doc-item">
                    <span>
                      {c.name}
                      <span className="adm-td-sub">{c.sizeKg} kg</span>
                    </span>
                    {c.isActive && <span className="adm-muted">Active</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="CRM">
            <CrmPanel userId={user.id} />
          </Section>

          <Section title={`Legal acceptances (${user.legalAcceptances.length})`}>
            {user.legalAcceptances.length === 0 ? (
              <p className="adm-muted">No terms accepted on record.</p>
            ) : (
              <ul className="adm-doc-list">
                {user.legalAcceptances.map((l) => (
                  <li key={l.id} className="adm-doc-item">
                    <span>
                      {humaniseEnum(l.document)} · v{l.version}
                      {l.ipAddress && <span className="adm-td-sub">IP {l.ipAddress}</span>}
                    </span>
                    <span className="adm-muted">{formatDateTime(l.acceptedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
