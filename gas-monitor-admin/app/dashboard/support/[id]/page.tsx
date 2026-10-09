'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getJson, patchJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { formatDateTime, formatNaira, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import { isSlaBreached } from '@/admin/modules/tickets';
import type {
  CannedReplyRow,
  TicketCategory,
  TicketDetail,
  TicketPriority,
  TicketStatus
} from '@/admin/modules/types';

const STATUSES: TicketStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CATEGORIES: TicketCategory[] = ['ORDER', 'PAYMENT', 'DELIVERY', 'ACCOUNT', 'VENDOR', 'DEVICE', 'OTHER'];
const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  PENDING: 'Waiting on customer',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed'
};

type Kind = 'reply' | 'note' | 'requester';
const KIND_HELP: Record<Kind, string> = {
  reply: 'Emailed to the requester. Sets the ticket to “Waiting on customer”.',
  note: 'Internal only. The requester never sees this.',
  requester: 'Record something the requester told you elsewhere. Reopens the ticket.'
};

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const canRead = usePermission('support.read');
  const canReply = usePermission('support.reply');

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [canned, setCanned] = useState<CannedReplyRow[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>('reply');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    getJson<{ ticket: TicketDetail }>(`/support/${id}`)
      .then((r) => {
        setTicket(r.ticket);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    getJson<{ replies: CannedReplyRow[] }>('/support/canned-replies')
      .then((r) => setCanned(r.replies))
      .catch(() => setCanned([]));
  }, []);

  async function patch(change: Record<string, unknown>) {
    setActionError(null);
    try {
      await patchJson(`/support/${id}`, change);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    setSending(true);
    setActionError(null);
    setNotice(null);
    try {
      const res = await sendJson<{ emailed: boolean | null }>('POST', `/support/${id}/messages`, { body, kind });
      setBody('');
      if (kind === 'reply') {
        setNotice(
          res.emailed
            ? 'Reply sent to the requester.'
            : 'Reply saved, but the email could not be delivered. Check the email configuration or contact them another way.'
        );
      }
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (!canRead) return <ForbiddenState permission="support.read" />;
  if (error) {
    return (
      <div className="adm-page">
        <ErrorState title="Could not load this ticket" error={error} onRetry={load} />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="adm-page">
        <LoadingBlock height={320} />
      </div>
    );
  }

  const closed = ticket.status === 'CLOSED';
  const breached = isSlaBreached(ticket);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <p className="adm-page-meta">
            <Link className="adm-link" href="/dashboard/support">
              ← Support inbox
            </Link>
          </p>
          <h1 className="adm-page-title">
            <span className="adm-muted">#{ticket.number}</span> {ticket.subject}
          </h1>
          <p className="adm-page-meta">
            {ticket.requesterName} · {ticket.requesterEmail} · opened {formatRelative(ticket.createdAt)} via{' '}
            {humaniseEnum(ticket.channel).toLowerCase()}
          </p>
        </div>
        <div className="adm-page-actions">
          <StatusBadge value={ticket.status} />
        </div>
      </header>

      {breached && (
        <div className="adm-inline-error" role="alert">
          <span>Nobody has replied yet and the first-response deadline ({formatDateTime(ticket.slaDueAt)}) has passed.</span>
        </div>
      )}
      {actionError && (
        <div className="adm-inline-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}
      {notice && (
        <div className="adm-alert" role="status">
          {notice}
        </div>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        {/* Conversation */}
        <section className="adm-card adm-card-pad" style={{ gridColumn: 'span 2', minWidth: 0 }}>
          <h2 className="adm-section-title">Conversation</h2>
          <ul style={{ listStyle: 'none', margin: 'var(--space-4) 0 0', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
            {ticket.messages.map((m) => (
              <li
                key={m.id}
                className="adm-card adm-card-pad"
                style={{
                  background: m.internal ? 'var(--warning-tint, rgba(180,120,20,0.10))' : undefined,
                  marginLeft: m.author === 'ADMIN' ? 'var(--space-5)' : 0,
                  marginRight: m.author === 'REQUESTER' ? 'var(--space-5)' : 0
                }}
              >
                <div className="adm-micro-label" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                  <span>
                    {m.authorName}
                    {m.author === 'SYSTEM' ? ' · update' : m.internal ? ' · internal note' : m.author === 'ADMIN' ? ' · reply' : ''}
                  </span>
                  <span title={formatDateTime(m.createdAt)}>{formatRelative(m.createdAt)}</span>
                </div>
                <p style={{ margin: 'var(--space-2) 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</p>
              </li>
            ))}
          </ul>

          {canReply && !closed ? (
            <div style={{ marginTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-3)' }}>
              <div className="adm-segmented" role="group" aria-label="Message type">
                {(['reply', 'note', 'requester'] as Kind[]).map((k) => (
                  <button key={k} type="button" className="adm-segment" aria-pressed={kind === k} onClick={() => setKind(k)}>
                    {k === 'reply' ? 'Reply' : k === 'note' ? 'Internal note' : 'Log customer reply'}
                  </button>
                ))}
              </div>
              <span className="adm-field-help">{KIND_HELP[kind]}</span>
              {kind === 'reply' && canned.length > 0 && (
                <select
                  className="adm-input"
                  aria-label="Insert a canned reply"
                  value=""
                  onChange={(e) => {
                    const r = canned.find((c) => c.id === e.target.value);
                    if (r) setBody((b) => (b ? `${b}\n\n${r.body}` : r.body));
                  }}
                >
                  <option value="">Insert a canned reply…</option>
                  {canned.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
              <textarea
                className="adm-input"
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={kind === 'reply' ? `Write to ${ticket.requesterName}…` : 'Write a note…'}
                aria-label="Message"
              />
              <div className="adm-dialog-actions">
                <button type="button" className="adm-btn adm-btn--primary" disabled={!body.trim() || sending} onClick={send}>
                  {sending ? 'Sending…' : kind === 'reply' ? 'Send reply' : kind === 'note' ? 'Add note' : 'Log message'}
                </button>
              </div>
            </div>
          ) : closed ? (
            <p className="adm-muted" style={{ marginTop: 'var(--space-5)' }}>
              This ticket is closed. Change its status to reopen it.
            </p>
          ) : null}
        </section>

        {/* Details */}
        <aside className="adm-card adm-card-pad" style={{ minWidth: 0 }}>
          <h2 className="adm-section-title">Details</h2>
          <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
            <label className="adm-field">
              <span className="adm-field-label">Status</span>
              <select className="adm-input" value={ticket.status} disabled={!canReply} onChange={(e) => patch({ status: e.target.value })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Priority</span>
              <select className="adm-input" value={ticket.priority} disabled={!canReply} onChange={(e) => patch({ priority: e.target.value })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {humaniseEnum(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-field">
              <span className="adm-field-label">Category</span>
              <select className="adm-input" value={ticket.category} disabled={!canReply} onChange={(e) => patch({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {humaniseEnum(c)}
                  </option>
                ))}
              </select>
            </label>

            <div className="adm-field">
              <span className="adm-field-label">Assigned to</span>
              <span>{ticket.assigneeName ?? <span className="adm-muted">Nobody</span>}</span>
              {canReply && (
                <span className="adm-row-actions">
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => patch({ assignee: 'me' })}>
                    Assign to me
                  </button>
                  {ticket.assigneeId && (
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => patch({ assignee: null })}>
                      Unassign
                    </button>
                  )}
                </span>
              )}
            </div>

            <div className="adm-field">
              <span className="adm-field-label">First reply due</span>
              <span>
                {ticket.firstResponseAt ? (
                  <>Replied {formatRelative(ticket.firstResponseAt)}</>
                ) : (
                  formatDateTime(ticket.slaDueAt)
                )}
              </span>
            </div>
          </div>

          {ticket.requester && (
            <section className="adm-detail-section">
              <h3 className="adm-micro-label">Account</h3>
              <p style={{ margin: 0 }}>
                {ticket.requester.name} <StatusBadge value={ticket.requester.role} />
              </p>
              <p className="adm-muted" style={{ margin: 0 }}>
                {ticket.requester.phone ?? 'No phone on file'} · joined {formatRelative(ticket.requester.createdAt)}
              </p>
            </section>
          )}
          {ticket.order && (
            <section className="adm-detail-section">
              <h3 className="adm-micro-label">Linked order</h3>
              <p style={{ margin: 0 }}>
                {ticket.order.quantity} × {ticket.order.cylinderSize} · {formatNaira(ticket.order.totalAmount)}{' '}
                <StatusBadge value={ticket.order.status} />
              </p>
              <p className="adm-muted" style={{ margin: 0 }}>
                {formatDateTime(ticket.order.createdAt)}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
