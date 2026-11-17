'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getJson, patchJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { formatDateTime, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import type { BugDetail, BugSeverity, BugStatus } from '@/admin/modules/bug-types';

const STATUSES: BugStatus[] = ['NEW', 'NEEDS_INFO', 'CONFIRMED', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'WONT_FIX', 'DUPLICATE'];
const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: 'New',
  NEEDS_INFO: 'Needs info from tester',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In progress',
  FIXED: 'Fixed (tester to retest)',
  VERIFIED: 'Verified by tester',
  WONT_FIX: "Won't fix",
  DUPLICATE: 'Duplicate'
};
const SEVERITIES: BugSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <section className="adm-detail-section">
    <h3 className="adm-micro-label">{label}</h3>
    <p style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</p>
  </section>
);

export default function BugPage() {
  const { number } = useParams<{ number: string }>();
  const canRead = usePermission('bugs.read');
  const canWork = usePermission('bugs.work');

  const [detail, setDetail] = useState<BugDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // A status change may need extra input: a build, a duplicate number, or a question for the tester.
  const [pending, setPending] = useState<{ status: BugStatus; build: string; duplicateOf: string; message: string } | null>(null);
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getJson<BugDetail>(`/bugs/${number}`)
      .then((r) => {
        setDetail(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [number]);
  useEffect(load, [load]);

  async function patch(change: Record<string, unknown>) {
    setActionError(null);
    setBusy(true);
    try {
      await patchJson(`/bugs/${number}`, change);
      setPending(null);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function chooseStatus(status: BugStatus) {
    if (!detail || status === detail.bug.status) return;
    // These need more than the status itself; the rest apply straight away.
    if (status === 'FIXED' || status === 'DUPLICATE' || status === 'NEEDS_INFO') {
      setPending({
        status,
        build: detail.bug.fixedInBuild ?? detail.bug.appVersion ?? '',
        duplicateOf: detail.bug.duplicateOfNumber ? String(detail.bug.duplicateOfNumber) : '',
        message: ''
      });
    } else {
      void patch({ status });
    }
  }

  function confirmPending() {
    if (!pending) return;
    const change: Record<string, unknown> = { status: pending.status };
    if (pending.status === 'FIXED') change.fixedInBuild = pending.build.trim();
    if (pending.status === 'DUPLICATE') change.duplicateOfNumber = Number(pending.duplicateOf.replace('#', ''));
    if (pending.message.trim()) change.message = pending.message.trim();
    void patch(change);
  }

  async function addComment() {
    setBusy(true);
    setActionError(null);
    try {
      await sendJson('POST', `/bugs/${number}/comments`, { body: comment, internal });
      setComment('');
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return <ForbiddenState permission="bugs.read" />;
  if (error) {
    return (
      <div className="adm-page">
        <ErrorState title="Could not load this report" error={error} onRetry={load} />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="adm-page">
        <LoadingBlock height={320} />
      </div>
    );
  }

  const { bug, tester, attachments, comments } = detail;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <p className="adm-page-meta">
            <Link className="adm-link" href="/dashboard/bugs">
              ← Bug reports
            </Link>
          </p>
          <h1 className="adm-page-title">
            <span className="adm-muted">#{bug.number}</span> {bug.title}
          </h1>
          <p className="adm-page-meta">
            {tester ? `${tester.name} · ${tester.email}` : 'Unknown tester'} · filed {formatRelative(bug.createdAt)} · {humaniseEnum(bug.area)}
            {bug.screen ? ` · ${bug.screen}` : ''}
          </p>
        </div>
        <div className="adm-page-actions">
          <StatusBadge value={bug.severity} />
          <StatusBadge value={bug.status} />
        </div>
      </header>

      {actionError && (
        <div className="adm-inline-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div style={{ gridColumn: 'span 2', minWidth: 0, display: 'grid', gap: 'var(--space-5)' }}>
          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">The report</h2>
            <Block label="Steps to reproduce">{bug.steps}</Block>
            <Block label="Expected">{bug.expected}</Block>
            <Block label="Actual">{bug.actual}</Block>
            <Block label="How often">{humaniseEnum(bug.frequency)}</Block>

            {attachments.length > 0 && (
              <section className="adm-detail-section">
                <h3 className="adm-micro-label">Evidence</h3>
                <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {attachments.map((a) =>
                    !a.url ? (
                      <span key={a.id} className="adm-muted">
                        {a.fileName} (not available)
                      </span>
                    ) : a.contentType.startsWith('video/') ? (
                      <video key={a.id} src={a.url} controls preload="metadata" style={{ width: '100%', borderRadius: 8 }} aria-label={a.fileName} />
                    ) : (
                      <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.fileName} style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                      </a>
                    )
                  )}
                </div>
                <p className="adm-field-help">Links expire after a few minutes; reload the page for fresh ones.</p>
              </section>
            )}
          </section>

          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">Discussion</h2>
            {comments.length === 0 ? (
              <p className="adm-muted">No comments yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 'var(--space-4) 0 0', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="adm-card adm-card-pad"
                    style={{ background: c.internal ? 'var(--warning-tint, rgba(180,120,20,0.10))' : undefined }}
                  >
                    <div className="adm-micro-label" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                      <span>
                        {c.authorName}
                        {c.internal ? ' · internal note' : c.author === 'TESTER' ? ' · tester' : ' · team'}
                      </span>
                      <span title={formatDateTime(c.createdAt)}>{formatRelative(c.createdAt)}</span>
                    </div>
                    <p style={{ margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</p>
                  </li>
                ))}
              </ul>
            )}

            {canWork && (
              <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
                <textarea
                  className="adm-input"
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={internal ? 'Note for the team (the tester will not see this)…' : `Reply to ${tester?.name ?? 'the tester'}…`}
                  aria-label="Comment"
                />
                <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  <span>Internal note (hidden from the tester)</span>
                </label>
                <div className="adm-dialog-actions">
                  <button type="button" className="adm-btn adm-btn--primary" disabled={!comment.trim() || busy} onClick={addComment}>
                    {internal ? 'Add note' : 'Send comment'}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="adm-card adm-card-pad" style={{ minWidth: 0 }}>
          <h2 className="adm-section-title">Triage</h2>
          <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
            <label className="adm-field">
              <span className="adm-field-label">Status</span>
              <select className="adm-input" value={bug.status} disabled={!canWork || busy} onChange={(e) => chooseStatus(e.target.value as BugStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {bug.status === 'FIXED' && bug.fixedInBuild && <span className="adm-field-help">Fix is in build {bug.fixedInBuild}.</span>}
              {bug.status === 'DUPLICATE' && bug.duplicateOfNumber && (
                <span className="adm-field-help">
                  Duplicate of{' '}
                  <Link className="adm-link" href={`/dashboard/bugs/${bug.duplicateOfNumber}`}>
                    #{bug.duplicateOfNumber}
                  </Link>
                </span>
              )}
            </label>

            <label className="adm-field">
              <span className="adm-field-label">Severity</span>
              <select className="adm-input" value={bug.severity} disabled={!canWork || busy} onChange={(e) => patch({ severity: e.target.value })}>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {humaniseEnum(s)}
                  </option>
                ))}
              </select>
            </label>

            <div className="adm-field">
              <span className="adm-field-label">Assigned to</span>
              <span>{bug.assigneeName ?? <span className="adm-muted">Nobody</span>}</span>
              {canWork && (
                <span className="adm-row-actions">
                  <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => patch({ assignee: 'me' })}>
                    Assign to me
                  </button>
                  {bug.assigneeId && (
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => patch({ assignee: 'none' })}>
                      Unassign
                    </button>
                  )}
                </span>
              )}
            </div>
          </div>

          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Where it happened</h3>
            <p style={{ margin: 0 }}>
              {[bug.deviceModel, bug.androidVersion && `Android ${bug.androidVersion}`, bug.appVersion && `app ${bug.appVersion}`, bug.network]
                .filter(Boolean)
                .join(' · ') || <span className="adm-muted">Not given</span>}
            </p>
            {bug.accountEmail && <p className="adm-muted" style={{ margin: 0 }}>Test account: {bug.accountEmail}</p>}
          </section>
        </aside>
      </div>

      {pending && (
        <div className="adm-card adm-card-pad" role="dialog" aria-label="Confirm status change" style={{ position: 'sticky', bottom: 'var(--space-4)', boxShadow: '0 8px 30px rgba(0,0,0,0.18)' }}>
          <h2 className="adm-section-title">Mark as “{STATUS_LABEL[pending.status]}”</h2>
          <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
            {pending.status === 'FIXED' && (
              <label className="adm-field">
                <span className="adm-field-label">Build with the fix</span>
                <input className="adm-input" value={pending.build} onChange={(e) => setPending({ ...pending, build: e.target.value })} placeholder="e.g. 1.0.4" />
                <span className="adm-field-help">The tester is emailed and asked to retest this build.</span>
              </label>
            )}
            {pending.status === 'DUPLICATE' && (
              <label className="adm-field">
                <span className="adm-field-label">Duplicate of report number</span>
                <input className="adm-input" value={pending.duplicateOf} onChange={(e) => setPending({ ...pending, duplicateOf: e.target.value })} placeholder="e.g. 12" />
              </label>
            )}
            <label className="adm-field">
              <span className="adm-field-label">{pending.status === 'NEEDS_INFO' ? 'What do you need to know?' : 'Message to the tester (optional)'}</span>
              <textarea className="adm-input" rows={3} value={pending.message} onChange={(e) => setPending({ ...pending, message: e.target.value })} />
            </label>
            <div className="adm-dialog-actions">
              <button type="button" className="adm-btn" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={
                  busy ||
                  (pending.status === 'FIXED' && !pending.build.trim()) ||
                  (pending.status === 'DUPLICATE' && !/^#?\d+$/.test(pending.duplicateOf.trim())) ||
                  (pending.status === 'NEEDS_INFO' && !pending.message.trim())
                }
                onClick={confirmPending}
              >
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
