'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ResourceList } from '@/admin/resource/resource-list';
import { ticketsModule } from '@/admin/modules/tickets';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { ConfirmDialog, Modal } from '@/admin/primitives/dialog';
import { LoadingState } from '@/admin/primitives/states';
import { humaniseEnum } from '@/admin/primitives/format';
import { Can } from '@/admin/permissions/use-permission';
import type {
  CannedReplyRow,
  SupportSummary,
  TicketCategory,
  TicketPriority,
  TicketRow
} from '@/admin/modules/types';

const CATEGORIES: TicketCategory[] = ['ORDER', 'PAYMENT', 'DELIVERY', 'ACCOUNT', 'VENDOR', 'DEVICE', 'OTHER'];
const PRIORITIES: TicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function SupportPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  const [summary, setSummary] = useState<SupportSummary | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    getJson<SupportSummary>('/support/summary')
      .then(setSummary)
      .catch(() => setSummary(null)); // the list below reports its own errors
  }, [version]);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Support inbox</h1>
          <p className="adm-page-meta">
            Enquiries from the website contact form, plus tickets logged by hand. Replies are emailed to the requester.
          </p>
        </div>
        <div className="adm-page-actions">
          <Can permission="support.manage">
            <button type="button" className="adm-btn" onClick={() => setManaging(true)}>
              Canned replies
            </button>
          </Can>
          <Can permission="support.reply">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>
              New ticket
            </button>
          </Can>
        </div>
      </header>

      <StatGrid>
        <StatCard
          label="Open"
          value={String(summary?.open ?? 0)}
          caption="Waiting on us"
          href="/dashboard/support?status=OPEN"
          loading={!summary}
        />
        <StatCard
          label="Waiting on customer"
          value={String(summary?.pending ?? 0)}
          href="/dashboard/support?status=PENDING"
          loading={!summary}
        />
        <StatCard
          label="Unassigned"
          value={String(summary?.unassigned ?? 0)}
          caption="Nobody owns these yet"
          actionable={(summary?.unassigned ?? 0) > 0}
          href="/dashboard/support?assignee=unassigned&status=active"
          loading={!summary}
        />
        <StatCard
          label="First reply overdue"
          value={String(summary?.slaBreached ?? 0)}
          caption={summary ? `${summary.assignedToMe} assigned to you` : undefined}
          actionable={(summary?.slaBreached ?? 0) > 0}
          href="/dashboard/support?sla=breached"
          loading={!summary}
        />
      </StatGrid>

      <ResourceList key={version} config={ticketsModule} />

      {creating && (
        <NewTicketModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {managing && <CannedRepliesModal onClose={() => setManaging(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------- new ticket --- */

function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    requesterName: '',
    requesterEmail: '',
    subject: '',
    message: '',
    category: 'OTHER' as TicketCategory,
    priority: 'NORMAL' as TicketPriority
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.requesterName.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.requesterEmail) && form.subject.trim().length >= 3 && form.message.trim().length >= 2;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { ticket } = await sendJson<{ ticket: TicketRow }>('POST', '/support', form);
      onCreated();
      router.push(`/dashboard/support/${ticket.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New ticket"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create ticket'}
          </button>
        </>
      }
    >
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <label className="adm-field">
          <span className="adm-field-label">Requester name</span>
          <input className="adm-input" value={form.requesterName} onChange={(e) => set('requesterName', e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Requester email</span>
          <input type="email" className="adm-input" value={form.requesterEmail} onChange={(e) => set('requesterEmail', e.target.value)} />
          <span className="adm-field-help">Replies are emailed here. A matching account is linked automatically.</span>
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Subject</span>
          <input className="adm-input" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
        </label>
        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: '1fr 1fr' }}>
          <label className="adm-field">
            <span className="adm-field-label">Category</span>
            <select className="adm-input" value={form.category} onChange={(e) => set('category', e.target.value as TicketCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humaniseEnum(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Priority</span>
            <select className="adm-input" value={form.priority} onChange={(e) => set('priority', e.target.value as TicketPriority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {humaniseEnum(p)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="adm-field">
          <span className="adm-field-label">What they said</span>
          <textarea className="adm-input" rows={5} value={form.message} onChange={(e) => set('message', e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- canned replies --- */

function CannedRepliesModal({ onClose }: { onClose: () => void }) {
  const [replies, setReplies] = useState<CannedReplyRow[] | null>(null);
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string } | null>(null);
  const [removing, setRemoving] = useState<CannedReplyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getJson<{ replies: CannedReplyRow[] }>('/support/canned-replies')
      .then((r) => setReplies(r.replies))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = { title: draft.title, body: draft.body };
      if (draft.id) await sendJson('PATCH', `/support/canned-replies/${draft.id}`, body);
      else await sendJson('POST', '/support/canned-replies', body);
      setDraft(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Canned replies" onClose={onClose} wide>
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {draft ? (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <label className="adm-field">
            <span className="adm-field-label">Title</span>
            <input className="adm-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Reply text</span>
            <textarea className="adm-input" rows={6} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="adm-dialog-actions">
            <button type="button" className="adm-btn" onClick={() => setDraft(null)}>
              Back
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={busy || draft.title.trim().length < 2 || draft.body.trim().length < 2}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save reply'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {!replies ? (
            <p className="adm-muted">Loading…</p>
          ) : replies.length === 0 ? (
            <p className="adm-muted">No canned replies yet. Add the answers you find yourself typing again and again.</p>
          ) : (
            <ul className="adm-doc-list">
              {replies.map((r) => (
                <li key={r.id} className="adm-doc-item">
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {r.title}
                    <span className="adm-td-sub">{r.body.slice(0, 90)}{r.body.length > 90 ? '…' : ''}</span>
                  </span>
                  <span className="adm-row-actions">
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setDraft(r)}>
                      Edit
                    </button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setRemoving(r)}>
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="adm-dialog-actions">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setDraft({ title: '', body: '' })}>
              Add canned reply
            </button>
          </div>
        </>
      )}

      {removing && (
        <ConfirmDialog
          title={`Delete “${removing.title}”?`}
          body="Agents will no longer be able to insert this reply. Replies already sent are not affected."
          confirmLabel="Delete"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await sendJson('DELETE', `/support/canned-replies/${removing.id}`);
            setRemoving(null);
            load();
          }}
        />
      )}
    </Modal>
  );
}
