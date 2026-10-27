'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from '@/admin/data/source';
import { ConfirmDialog } from '@/admin/primitives/dialog';
import { ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { BroadcastAudience, BroadcastRow } from '@/admin/modules/types';

/**
 * Broadcasts: a message from the 4FG team to everyone, one kind of account, or
 * one person. Always lands in the in-app inbox (mobile and website); email and
 * push are optional extras. Super admin only, and it cannot be recalled once sent.
 */

const AUDIENCES: { value: BroadcastAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Everyone', hint: 'Customers, vendors, riders, fleets and branch managers' },
  { value: 'CONSUMERS', label: 'Customers', hint: 'Everyone who buys gas' },
  { value: 'VENDORS', label: 'Vendors', hint: 'Gas vendors' },
  { value: 'RIDERS', label: 'Riders & fleets', hint: 'Riders and logistics companies' },
  { value: 'USER', label: 'One person', hint: 'A single account you choose' }
];

const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  ALL: 'Everyone',
  CONSUMERS: 'Customers',
  VENDORS: 'Vendors',
  RIDERS: 'Riders & fleets',
  USER: 'One person'
};

interface UserHit {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Paginated<T> {
  data: T[];
  pagination: { total: number };
}

export default function BroadcastsPage() {
  const canRead = usePermission('broadcasts.read');

  const [rows, setRows] = useState<BroadcastRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const [audience, setAudience] = useState<BroadcastAudience>('ALL');
  const [target, setTarget] = useState<UserHit | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [sendInApp, setSendInApp] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [sendPush, setSendPush] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const [count, setCount] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    getJson<Paginated<BroadcastRow>>('/broadcasts?limit=20')
      .then((r) => {
        setRows(r.data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  useEffect(() => {
    if (canRead) load();
  }, [canRead, load]);

  // Keep watching while something is still going out.
  const sending = rows?.some((r) => r.status === 'SENDING') ?? false;
  useEffect(() => {
    if (!sending) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [sending, load]);

  // How many people the chosen audience reaches right now.
  useEffect(() => {
    if (!canRead) return;
    if (audience === 'USER' && !target) {
      setCount(null);
      return;
    }
    let live = true;
    const qs = new URLSearchParams({ audience, ...(audience === 'USER' && target ? { targetUserId: target.id } : {}) });
    getJson<{ count: number }>(`/broadcasts/preview?${qs}`)
      .then((r) => live && setCount(r.count))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [audience, target, canRead]);

  // Find a person for "One person".
  useEffect(() => {
    if (audience !== 'USER' || query.trim().length < 2) {
      setHits([]);
      return;
    }
    let live = true;
    const t = window.setTimeout(() => {
      getJson<Paginated<UserHit>>(`/users?limit=6&q=${encodeURIComponent(query.trim())}`)
        .then((r) => live && setHits(r.data))
        .catch(() => live && setHits([]));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [query, audience]);

  if (!canRead) return <ForbiddenState permission="broadcasts.read" />;

  const channels = [sendInApp && 'in-app inbox', sendEmail && 'email', sendPush && 'push notification'].filter(Boolean);
  const formError =
    title.trim().length < 3
      ? 'Give the message a title.'
      : body.trim().length < 3
        ? 'Write the message.'
        : channels.length === 0
          ? 'Choose at least one way to deliver it.'
          : audience === 'USER' && !target
            ? 'Choose who to send it to.'
            : count === 0
              ? 'No active accounts match this audience.'
              : null;

  async function send() {
    await postJson('/broadcasts', {
      title: title.trim(),
      body: body.trim(),
      audience,
      ...(audience === 'USER' && target ? { targetUserId: target.id } : {}),
      sendInApp,
      sendEmail,
      sendPush
    });
    setConfirming(false);
    setTitle('');
    setBody('');
    setNotice('Sending now. Progress shows in the history below.');
    window.setTimeout(() => setNotice(null), 6000);
    load();
  }

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Broadcasts</h1>
          <p className="adm-page-meta">
            Message customers, vendors and riders. Messages cannot be recalled once sent, and every one is recorded
            in the audit log.
          </p>
        </div>
      </header>

      {notice && (
        <div className="adm-alert" role="status">
          {notice}
        </div>
      )}

      <section className="adm-card adm-card-pad">
        <h2 className="adm-section-title">New message</h2>

        <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
          <fieldset className="adm-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="adm-field-label">Send to</legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  aria-pressed={audience === a.value}
                  title={a.hint}
                  className={`adm-btn ${audience === a.value ? 'adm-btn--primary' : ''}`}
                  onClick={() => {
                    setAudience(a.value);
                    setTarget(null);
                    setQuery('');
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <span className="adm-field-help">{AUDIENCES.find((a) => a.value === audience)?.hint}</span>
          </fieldset>

          {audience === 'USER' && (
            <div className="adm-field">
              <span className="adm-field-label">Who</span>
              {target ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="adm-badge adm-badge--info">
                    {target.name} · {target.email} · {target.role.toLowerCase()}
                  </span>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setTarget(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="adm-input"
                    placeholder="Search by name, email or phone…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {hits.length > 0 && (
                    <ul className="adm-doc-list" style={{ marginTop: 8 }}>
                      {hits.map((h) => (
                        <li key={h.id} className="adm-doc-item">
                          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                            {h.name}
                            <span className="adm-td-sub">
                              {h.email} · {h.role.toLowerCase()}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="adm-btn adm-btn--sm"
                            onClick={() => {
                              setTarget(h);
                              setHits([]);
                            }}
                          >
                            Choose
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <fieldset className="adm-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="adm-field-label">Deliver by</legend>
            <label className="adm-switch-row">
              <span className="adm-switch-copy">
                <strong>In-app inbox</strong>
                <span className="adm-field-help">
                  Shows in the notifications screen of the mobile app and the website dashboard.
                </span>
              </span>
              <input type="checkbox" className="adm-checkbox" checked={sendInApp} onChange={(e) => setSendInApp(e.target.checked)} />
            </label>
            <label className="adm-switch-row">
              <span className="adm-switch-copy">
                <strong>Email</strong>
                <span className="adm-field-help">
                  Verified addresses only. People who turned email alerts off are skipped.
                </span>
              </span>
              <input type="checkbox" className="adm-checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            </label>
            <label className="adm-switch-row">
              <span className="adm-switch-copy">
                <strong>Push notification</strong>
                <span className="adm-field-help">
                  Phones with the app installed and push turned on. Needs a build that includes notifications.
                </span>
              </span>
              <input type="checkbox" className="adm-checkbox" checked={sendPush} onChange={(e) => setSendPush(e.target.checked)} />
            </label>
          </fieldset>

          <label className="adm-field">
            <span className="adm-field-label">Title</span>
            <input className="adm-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="adm-field">
            <span className="adm-field-label">Message</span>
            <textarea className="adm-input" rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="adm-field-help">{body.length} / 2000</span>
          </label>
        </div>

        <div className="adm-dialog-actions" style={{ marginTop: 'var(--space-4)' }}>
          <span className="adm-field-help" role={formError ? 'alert' : undefined}>
            {formError ?? (count != null ? `Will reach ${count.toLocaleString()} account${count === 1 ? '' : 's'}.` : '')}
          </span>
          <button type="button" className="adm-btn adm-btn--primary" disabled={Boolean(formError)} onClick={() => setConfirming(true)}>
            Review and send
          </button>
        </div>
      </section>

      <section className="adm-card adm-card-pad">
        <h2 className="adm-section-title">History</h2>
        {error ? (
          <ErrorState title="Could not load broadcasts" error={error} onRetry={load} />
        ) : !rows ? (
          <LoadingBlock height={120} />
        ) : rows.length === 0 ? (
          <p className="adm-muted" style={{ marginTop: 'var(--space-3)' }}>
            Nothing sent yet.
          </p>
        ) : (
          <div className="adm-table-scroll" style={{ marginTop: 'var(--space-3)' }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Message</th>
                  <th>To</th>
                  <th>Delivered</th>
                  <th>Status</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.title}
                      <span className="adm-td-sub">by {r.createdByName ?? 'an admin'}</span>
                    </td>
                    <td>{AUDIENCE_LABEL[r.audience]}</td>
                    <td>
                      {r.recipientCount.toLocaleString()} reached
                      <span className="adm-td-sub">
                        {[
                          r.sendInApp && 'in-app',
                          r.sendEmail && `${r.emailsSent.toLocaleString()} emails`,
                          r.sendPush && `${r.pushesSent.toLocaleString()} pushes`
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`adm-badge adm-badge--${r.status === 'SENT' ? 'success' : r.status === 'FAILED' ? 'error' : 'warning'}`}
                        title={r.error ?? undefined}
                      >
                        {r.status === 'SENT' ? 'Sent' : r.status === 'FAILED' ? 'Failed' : 'Sending…'}
                      </span>
                    </td>
                    <td title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirming && (
        <ConfirmDialog
          title="Send this message?"
          body={`"${title.trim()}" goes to ${
            audience === 'USER' && target ? `${target.name} (${target.email})` : `${(count ?? 0).toLocaleString()} accounts (${AUDIENCE_LABEL[audience].toLowerCase()})`
          } by ${channels.join(', ')}. It cannot be recalled.`}
          confirmLabel="Send now"
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        />
      )}
    </div>
  );
}
