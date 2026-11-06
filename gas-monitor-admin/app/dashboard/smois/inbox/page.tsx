'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { formatDateTime } from '@/admin/primitives/format';
import { useAdminSession } from '@/lib/admin-session-context';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, PLATFORM_LABEL, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, Toolbar, fmt, useAccounts, useApi, useDebounced, type Page
} from '../_ui';

interface Conv {
  id: string; accountId: string; kind: string; subject: string; status: string; priority: string; ownerId: string | null; ownerName: string | null;
  receivedAt: string; firstResponseAt: string | null; escalationType: string | null; escalationNote: string | null;
  contact: { id: string; displayName: string; username: string | null; platform: string } | null;
  sla: { targetMinutes: number; dueAt: string; responded: boolean; breached: boolean };
  messages?: { id: string; direction: string; body: string; authorName: string; createdAt: string }[];
}
interface Summary {
  open: number; unassigned: number; escalated: number; overdueNow: number; note: string;
  last30Days: { answered: number; medianFirstResponseMinutes: number | null; withinTargetPct: number | null };
}
interface ContactOpt { id: string; displayName: string; username: string | null; platform: string }

const badge = (s: string) => (s === 'WAITING_CUSTOMER' ? 'PENDING' : s);

export default function InboxPage() {
  const [filter, setFilter] = useState<'open' | 'mine' | 'unassigned' | 'all'>('open');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const qs = new URLSearchParams({ limit: '50' });
  if (filter === 'open') qs.set('open', '1');
  if (filter === 'mine') { qs.set('open', '1'); qs.set('mine', '1'); }
  if (filter === 'unassigned') { qs.set('open', '1'); qs.set('unassigned', '1'); }
  if (dq) qs.set('q', dq);
  const state = useApi<Page<Conv>>(`/smois/inbox?${qs}`);
  const summary = useApi<Summary>('/smois/inbox-summary');

  return (
    <RequirePermission permission="smois.inbox.work">
      <PageShell
        title="Social inbox"
        meta="Messages, comments and enquiries the team has logged. Each has one owner, so nobody answers twice."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>Log an enquiry</button>}
      >
        <Async state={summary} columns={4}>
          {(s) => (
            <>
              <StatGrid>
                <StatCard label="Open" value={fmt(s.open)} caption={`${s.unassigned} without an owner`} />
                <StatCard label="Past response target" value={fmt(s.overdueNow)} actionable={s.overdueNow > 0} caption="Unanswered and late" />
                <StatCard label="Escalated" value={fmt(s.escalated)} />
                <StatCard
                  label="Median first reply (30 days)"
                  value={s.last30Days.medianFirstResponseMinutes == null ? '—' : `${s.last30Days.medianFirstResponseMinutes} min`}
                  caption={s.last30Days.withinTargetPct == null ? 'No replies yet' : `${s.last30Days.withinTargetPct}% within target`}
                />
              </StatGrid>
              <p className="adm-filter-note">{s.note}</p>
            </>
          )}
        </Async>
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Show</span>
            <select className="adm-input" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="open">Open</option>
              <option value="mine">Mine</option>
              <option value="unassigned">No owner</option>
              <option value="all">Everything</option>
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Search</span>
            <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </Toolbar>
        <Async state={state} columns={5}>
          {(p) =>
            p.data.length === 0 ? (
              <EmptyState title="Nothing here" description="Log enquiries from the platforms as they come in." />
            ) : (
              <SimpleTable head={['Conversation', 'From', 'Status', 'Owner', 'Reply due']}>
                {p.data.map((c) => (
                  <tr key={c.id} className="adm-tr" style={{ cursor: 'pointer' }} onClick={() => setOpenId(c.id)}>
                    <Td sub={`${c.kind.toLowerCase()} · ${c.priority.toLowerCase()} priority`}>
                      <button type="button" className="adm-link" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpenId(c.id)}>{c.subject}</button>
                    </Td>
                    <Td>{c.contact ? `${c.contact.displayName}${c.contact.username ? ` (${c.contact.username})` : ''}` : <span className="adm-muted">Unknown</span>}</Td>
                    <Td sub={c.escalationType ? c.escalationType.toLowerCase() : undefined}><StatusBadge value={badge(c.status)} /></Td>
                    <Td>{c.ownerName ?? <span className="adm-muted">No owner</span>}</Td>
                    <Td>
                      {c.sla.responded ? (
                        <span className="adm-muted">Replied</span>
                      ) : (
                        <span style={c.sla.breached ? { color: 'var(--error)' } : undefined}>{c.sla.breached ? 'Late · ' : ''}{formatDateTime(c.sla.dueAt)}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </SimpleTable>
            )
          }
        </Async>
        {creating && <NewConversation onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); summary.reload(); }} />}
        {openId && <ConversationModal id={openId} onClose={() => setOpenId(null)} onChanged={() => { state.reload(); summary.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function NewConversation({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const accounts = useAccounts();
  const contacts = useApi<Page<ContactOpt>>('/smois/contacts?limit=100');
  const [f, setF] = useState({ accountId: '', contactId: '', kind: 'DM', subject: '', body: '', priority: 'NORMAL' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <FormModal title="Log an enquiry" onClose={onClose} submitLabel="Log" disabled={!f.accountId || f.subject.trim().length < 2 || !f.body.trim()}
      onSubmit={async () => { await sendJson('POST', '/smois/inbox', { ...f, contactId: f.contactId || null }); onDone(); }}>
      <SelectField label="Account it arrived on" value={f.accountId} onChange={set('accountId')} required
        options={[{ value: '', label: 'Choose…' }, ...(accounts.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${PLATFORM_LABEL[a.platform]})` }))]} />
      <SelectField label="From (optional)" value={f.contactId} onChange={set('contactId')} help="Add the person under Contacts first."
        options={[{ value: '', label: 'Unknown' }, ...(contacts.data?.data ?? []).map((c) => ({ value: c.id, label: `${c.displayName} · ${PLATFORM_LABEL[c.platform]}` }))]} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <SelectField label="Type" value={f.kind} onChange={set('kind')} options={['DM', 'COMMENT', 'MENTION', 'ENQUIRY'].map((x) => ({ value: x, label: x.toLowerCase() }))} />
        <SelectField label="Priority" value={f.priority} onChange={set('priority')} options={[{ value: 'HIGH', label: 'High (30 min)' }, { value: 'NORMAL', label: 'Normal (2 h)' }, { value: 'LOW', label: 'Low (24 h)' }]} />
      </div>
      <TextField label="Subject" value={f.subject} onChange={set('subject')} required />
      <TextArea label="What they wrote" value={f.body} onChange={set('body')} required />
    </FormModal>
  );
}

function ConversationModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const state = useApi<{ conversation: Conv }>(`/smois/inbox/${id}`);
  const { adminId } = useAdminSession();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [escalating, setEscalating] = useState(false);
  const refresh = () => { state.reload(); onChanged(); };
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal wide title="Conversation" onClose={onClose} footer={<button type="button" className="adm-btn" onClick={onClose}>Close</button>}>
      <Async state={state} columns={2}>
        {({ conversation: c }) => {
          const finished = ['RESOLVED', 'CLOSED'].includes(c.status);
          const mine = c.ownerId === adminId;
          return (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <div>
                <h3 style={{ margin: 0 }}>{c.subject}</h3>
                <p className="adm-muted">
                  <StatusBadge value={badge(c.status)} /> · owner: {c.ownerName ?? 'none'}
                  {c.escalationType ? ` · escalated (${c.escalationType.toLowerCase()}): ${c.escalationNote}` : ''}
                </p>
              </div>
              {error && <div className="adm-inline-error" role="alert"><span>{error}</span></div>}
              {c.messages?.map((m) => (
                <div key={m.id} className="adm-card adm-card-pad">
                  <div className="adm-micro-label">{m.direction === 'INBOUND' ? 'Customer' : m.direction === 'NOTE' ? 'Internal note' : 'Reply'} · {m.authorName} · {formatDateTime(m.createdAt)}</div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.body}</p>
                </div>
              ))}
              {!finished && (
                <>
                  <TextArea label="Write" value={body} onChange={setBody} rows={3} help="A reply here records what you sent. Send it on the platform itself." />
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {!c.ownerId && <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => act(() => sendJson('POST', `/smois/inbox/${c.id}/claim`))}>Take this</button>}
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" disabled={!body.trim() || (!!c.ownerId && !mine)}
                      onClick={() => act(async () => { await sendJson('POST', `/smois/inbox/${c.id}/reply`, { body, direction: 'OUTBOUND' }); setBody(''); })}>Record reply</button>
                    <button type="button" className="adm-btn adm-btn--sm" disabled={!body.trim()}
                      onClick={() => act(async () => { await sendJson('POST', `/smois/inbox/${c.id}/reply`, { body, direction: 'NOTE' }); setBody(''); })}>Add note</button>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setEscalating(true)}>Escalate</button>
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => act(() => sendJson('POST', `/smois/inbox/${c.id}/status`, { status: 'RESOLVED' }))}>Resolve</button>
                  </div>
                </>
              )}
              {finished && <button type="button" className="adm-btn adm-btn--sm" onClick={() => act(() => sendJson('POST', `/smois/inbox/${c.id}/status`, { status: 'OPEN' }))}>Reopen</button>}
              {escalating && <Escalate id={c.id} onClose={() => setEscalating(false)} onDone={() => { setEscalating(false); refresh(); }} />}
            </div>
          );
        }}
      </Async>
    </Modal>
  );
}

function Escalate({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState('COMPLAINT');
  const [note, setNote] = useState('');
  return (
    <FormModal title="Escalate" onClose={onClose} submitLabel="Escalate" disabled={note.trim().length < 3}
      onSubmit={async () => { await sendJson('POST', `/smois/inbox/${id}/status`, { status: 'ESCALATED', escalationType: type, escalationNote: note }); onDone(); }}>
      <SelectField label="Kind" value={type} onChange={setType} options={['COMPLAINT', 'LEGAL', 'SECURITY', 'PRODUCT', 'MEDIA', 'PARTNERSHIP', 'SENSITIVE'].map((x) => ({ value: x, label: x.toLowerCase() }))} />
      <TextArea label="Why" value={note} onChange={setNote} rows={3} required />
    </FormModal>
  );
}
