'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Modal } from '@/admin/primitives/dialog';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, LoadingState } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { useAdminSession } from '@/lib/admin-session-context';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, PLATFORM_LABEL, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, Toolbar, useAccounts,
  useApi, useDebounced, useTeam, type AccountRef, type Page
} from '../_ui';

interface Content {
  id: string; title: string; objective: string | null; category: string | null; format: string; caption: string;
  hashtags: string | null; mediaNotes: string | null; accountId: string; status: string; version: number;
  creatorId: string; creatorName: string; reviewerName: string | null; plannedAt: string | null; updatedAt: string;
  account: AccountRef;
}
interface Detail extends Content {
  versions: { id: string; version: number; title: string; caption: string; editorName: string; reason: string | null; createdAt: string }[];
  reviews: { id: string; version: number; decision: string; comments: string | null; reviewerName: string; createdAt: string }[];
  publications: { id: string; url: string | null; publishedAt: string; recordedByName: string; approvedByName: string | null; bypassReason: string | null }[];
}

const STATUS_OPTIONS = ['IDEA', 'PLANNED', 'IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'];
const FORMATS = ['TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY', 'POLL', 'LINK', 'DOCUMENT'];

export default function ContentPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ContentList />
    </Suspense>
  );
}

function ContentList() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const qs = new URLSearchParams({ limit: '50' });
  if (status) qs.set('status', status);
  if (mine) qs.set('mine', '1');
  if (dq) qs.set('q', dq);
  const state = useApi<Page<Content>>(`/smois/content?${qs}`);

  return (
    <RequirePermission permission="smois.read">
      <PageShell
        title="Content"
        meta="Plan, write, review and approve posts. Nothing is published until it has been approved."
        actions={
          <Can permission="smois.content.create">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>New content</button>
          </Can>
        }
      >
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Status</span>
            <select className="adm-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</option>)}
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Search</span>
            <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or caption…" />
          </label>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', paddingBottom: 8 }}>
            <input type="checkbox" className="adm-checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Mine only
          </label>
        </Toolbar>

        <Async state={state} columns={5}>
          {(page) =>
            page.data.length === 0 ? (
              <EmptyState title="No content yet" description="Content you create appears here with its approval history." />
            ) : (
              <SimpleTable head={['Content', 'Account', 'Status', 'Planned', 'By']}>
                {page.data.map((c) => (
                  <tr key={c.id} className="adm-tr" onClick={() => setOpenId(c.id)} style={{ cursor: 'pointer' }}>
                    <Td sub={`${c.format.toLowerCase()}${c.category ? ` · ${c.category}` : ''} · v${c.version}`}>
                      <button type="button" className="adm-link" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpenId(c.id)}>{c.title}</button>
                    </Td>
                    <Td sub={c.account.handle}>{c.account.name} · {PLATFORM_LABEL[c.account.platform] ?? c.account.platform}</Td>
                    <Td><StatusBadge value={c.status} /></Td>
                    <Td>{c.plannedAt ? formatDateTime(c.plannedAt) : <span className="adm-muted">Not dated</span>}</Td>
                    <Td>{c.creatorName}</Td>
                  </tr>
                ))}
              </SimpleTable>
            )
          }
        </Async>

        {creating && <ContentForm onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
        {openId && <ContentDetail id={openId} onClose={() => setOpenId(null)} onChanged={state.reload} />}
      </PageShell>
    </RequirePermission>
  );
}

function ContentForm({ existing, onClose, onDone }: { existing?: Detail; onClose: () => void; onDone: () => void }) {
  const accounts = useAccounts();
  const team = useTeam();
  const material = !!existing && ['SUBMITTED', 'APPROVED', 'SCHEDULED'].includes(existing.status);
  const [f, setF] = useState({
    title: existing?.title ?? '', accountId: existing?.accountId ?? '', format: existing?.format ?? 'TEXT',
    category: existing?.category ?? '', objective: existing?.objective ?? '', caption: existing?.caption ?? '',
    hashtags: existing?.hashtags ?? '', mediaNotes: existing?.mediaNotes ?? '',
    plannedAt: existing?.plannedAt ? new Date(existing.plannedAt).toISOString().slice(0, 16) : '', reviewerId: '', reason: ''
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const reviewers = (team.data?.data ?? []).filter((m) => m.smosRole === 'REVIEWER' || m.smosRole === 'MANAGEMENT' || m.role === 'SUPER_ADMIN');
  return (
    <FormModal wide title={existing ? 'Edit content' : 'New content'} onClose={onClose} submitLabel={existing ? 'Save changes' : 'Create'}
      disabled={f.title.trim().length < 2 || !f.accountId || (material && f.reason.trim().length < 3)}
      onSubmit={async () => {
        const body = {
          title: f.title, format: f.format, category: f.category || null, objective: f.objective || null, caption: f.caption,
          hashtags: f.hashtags || null, mediaNotes: f.mediaNotes || null,
          plannedAt: f.plannedAt ? new Date(f.plannedAt).toISOString() : null, reviewerId: f.reviewerId || null
        };
        if (existing) await sendJson('PATCH', `/smois/content/${existing.id}`, { ...body, reason: f.reason || undefined });
        else await sendJson('POST', '/smois/content', { ...body, accountId: f.accountId });
        onDone();
      }}>
      {!existing && (
        <SelectField label="Account" value={f.accountId} onChange={set('accountId')} required
          options={[{ value: '', label: accounts.loading ? 'Loading…' : 'Choose…' }, ...(accounts.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${PLATFORM_LABEL[a.platform] ?? a.platform})` }))]}
          help="You can create content for accounts you are assigned to." />
      )}
      <TextField label="Title" value={f.title} onChange={set('title')} required />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <SelectField label="Format" value={f.format} onChange={set('format')} options={FORMATS.map((x) => ({ value: x, label: x.toLowerCase() }))} />
        <TextField label="Category" value={f.category} onChange={set('category')} placeholder="e.g. Product promotion" />
      </div>
      <TextField label="Objective" value={f.objective} onChange={set('objective')} />
      <TextArea label="Caption" value={f.caption} onChange={set('caption')} rows={5} />
      <TextField label="Hashtags" value={f.hashtags} onChange={set('hashtags')} />
      <TextField label="Media notes" value={f.mediaNotes} onChange={set('mediaNotes')} help="Describe or link the image/video. Files are not uploaded here yet." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <TextField label="Planned for" type="datetime-local" value={f.plannedAt} onChange={set('plannedAt')} />
        <SelectField label="Reviewer (optional)" value={f.reviewerId} onChange={set('reviewerId')} options={[{ value: '', label: 'Any reviewer' }, ...reviewers.map((r) => ({ value: r.id, label: r.name }))]} />
      </div>
      {material && <TextField label="Why are you changing it?" value={f.reason} onChange={set('reason')} required help="Changing submitted or approved copy sends it back for review." />}
    </FormModal>
  );
}

function ContentDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const state = useApi<{ content: Detail }>(`/smois/content/${id}`);
  const { adminId } = useAdminSession();
  const canReview = usePermission('smois.content.review');
  const canPublish = usePermission('smois.content.publish');
  const canCreate = usePermission('smois.content.create');
  const [mode, setMode] = useState<null | 'edit' | 'review' | 'publish'>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { state.reload(); onChanged(); };
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal wide title="Content" onClose={onClose} footer={<button type="button" className="adm-btn" onClick={onClose}>Close</button>}>
      <Async state={state} columns={2}>
        {({ content: c }) => (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <h3 style={{ margin: 0 }}>{c.title}</h3>
              <p className="adm-muted">{c.account.name} · {PLATFORM_LABEL[c.account.platform]} · {c.format.toLowerCase()} · by {c.creatorName} · version {c.version}</p>
              <StatusBadge value={c.status} />
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, font: 'inherit' }}>{c.caption || <span className="adm-muted">No caption yet.</span>}</pre>
            {c.hashtags && <p className="adm-muted">{c.hashtags}</p>}
            {c.mediaNotes && <p className="adm-muted">Media: {c.mediaNotes}</p>}
            {error && <div className="adm-inline-error" role="alert"><span>{error}</span></div>}

            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {canCreate && ['IDEA', 'PLANNED', 'IN_PRODUCTION', 'REVISION_REQUESTED', 'SUBMITTED', 'APPROVED', 'SCHEDULED'].includes(c.status) && (
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setMode('edit')}>Edit</button>
              )}
              {canCreate && ['IDEA', 'PLANNED', 'IN_PRODUCTION', 'REVISION_REQUESTED'].includes(c.status) && (
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => act(() => sendJson('POST', `/smois/content/${c.id}/submit`))}>Submit for review</button>
              )}
              {canReview && c.status === 'SUBMITTED' && c.creatorId !== adminId && (
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setMode('review')}>Review</button>
              )}
              {canCreate && c.status === 'APPROVED' && (
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => act(() => sendJson('POST', `/smois/content/${c.id}/status`, { status: 'SCHEDULED' }))}>Mark scheduled</button>
              )}
              {canPublish && ['APPROVED', 'SCHEDULED'].includes(c.status) && (
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setMode('publish')}>Record as published</button>
              )}
              {canCreate && !['PUBLISHED', 'CANCELLED', 'ARCHIVED', 'REJECTED'].includes(c.status) && (
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => act(() => sendJson('POST', `/smois/content/${c.id}/status`, { status: 'CANCELLED' }))}>Cancel</button>
              )}
              {canCreate && ['PUBLISHED', 'REJECTED', 'CANCELLED'].includes(c.status) && (
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => act(() => sendJson('POST', `/smois/content/${c.id}/status`, { status: 'ARCHIVED' }))}>Archive</button>
              )}
            </div>

            <h4 className="adm-micro-label">Reviews</h4>
            {c.reviews.length === 0 ? <p className="adm-muted">Not reviewed yet.</p> : c.reviews.map((r) => (
              <p key={r.id}><StatusBadge value={r.decision} /> {r.reviewerName} on v{r.version}, {formatDateTime(r.createdAt)}{r.comments ? ` — ${r.comments}` : ''}</p>
            ))}
            <h4 className="adm-micro-label">Publications</h4>
            {c.publications.length === 0 ? <p className="adm-muted">Not published.</p> : c.publications.map((p) => (
              <p key={p.id}>
                {formatDateTime(p.publishedAt)} · recorded by {p.recordedByName}
                {p.approvedByName ? ` · approved by ${p.approvedByName}` : ''}
                {p.bypassReason ? ` · EMERGENCY BYPASS: ${p.bypassReason}` : ''}
                {p.url && <> · <a className="adm-link" href={p.url} target="_blank" rel="noreferrer">link</a></>}
              </p>
            ))}
            <h4 className="adm-micro-label">Version history</h4>
            {c.versions.map((v) => (
              <p key={v.id} className="adm-muted">v{v.version} · {v.editorName} · {formatDateTime(v.createdAt)}{v.reason ? ` · ${v.reason}` : ''}</p>
            ))}

            {mode === 'edit' && <ContentForm existing={c} onClose={() => setMode(null)} onDone={() => { setMode(null); refresh(); }} />}
            {mode === 'review' && <ReviewForm content={c} onClose={() => setMode(null)} onDone={() => { setMode(null); refresh(); }} />}
            {mode === 'publish' && <PublishForm content={c} onClose={() => setMode(null)} onDone={() => { setMode(null); refresh(); }} />}
          </div>
        )}
      </Async>
    </Modal>
  );
}

function ReviewForm({ content, onClose, onDone }: { content: Detail; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState('APPROVED');
  const [comments, setComments] = useState('');
  return (
    <FormModal title={`Review version ${content.version}`} onClose={onClose} submitLabel="Submit decision" disabled={decision !== 'APPROVED' && comments.trim().length < 3}
      onSubmit={async () => { await sendJson('POST', `/smois/content/${content.id}/review`, { decision, comments: comments || null }); onDone(); }}>
      <SelectField label="Decision" value={decision} onChange={setDecision}
        options={[{ value: 'APPROVED', label: 'Approve' }, { value: 'REVISION_REQUESTED', label: 'Request changes' }, { value: 'REJECTED', label: 'Reject' }]} />
      <TextArea label="Comments" value={comments} onChange={setComments} rows={4} help={decision === 'APPROVED' ? 'Optional' : 'Required: tell the author what to change.'} />
    </FormModal>
  );
}

function PublishForm({ content, onClose, onDone }: { content: Detail; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [at, setAt] = useState(new Date().toISOString().slice(0, 16));
  return (
    <FormModal title="Record publication" onClose={onClose} submitLabel="Record"
      onSubmit={async () => {
        await sendJson('POST', `/smois/content/${content.id}/publish`, { url: url || null, publishedAt: new Date(at).toISOString() });
        onDone();
      }}>
      <p className="adm-muted">This records that you posted it. It does not post to the platform for you.</p>
      <TextField label="Link to the live post" type="url" value={url} onChange={setUrl} />
      <TextField label="Posted at" type="datetime-local" value={at} onChange={setAt} />
    </FormModal>
  );
}
