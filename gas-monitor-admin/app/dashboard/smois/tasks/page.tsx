'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, LoadingState } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { useAdminSession } from '@/lib/admin-session-context';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, Toolbar, useAccounts, useApi, useTeam, type Page
} from '../_ui';

interface Task {
  id: string; title: string; description: string | null; type: string; priority: string; status: string;
  assigneeId: string; assigneeName: string; createdByName: string; dueAt: string | null; completedAt: string | null;
  evidenceUrl: string | null; evidenceNote: string | null; reviewNote: string | null; account: { name: string; platform: string } | null;
}

const TYPES = ['CONTENT_CREATION', 'GRAPHIC_DESIGN', 'VIDEO_PRODUCTION', 'PUBLISHING', 'COMMUNITY', 'CAMPAIGN', 'ANALYTICS_REVIEW', 'REPORTING', 'COMPETITOR_RESEARCH', 'GENERAL'];
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();

export default function TasksPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Tasks />
    </Suspense>
  );
}

function Tasks() {
  const params = useSearchParams();
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(params.get('due') === 'overdue');
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState<{ task: Task; to: string } | null>(null);
  const qs = new URLSearchParams({ limit: '50' });
  if (status) qs.set('status', status);
  if (overdue) qs.set('due', 'overdue');
  const state = useApi<Page<Task>>(`/smois/tasks?${qs}`);
  const canManage = usePermission('smois.tasks.manage');
  const canWork = usePermission('smois.tasks.work');

  return (
    <RequirePermission permission="smois.read">
      <PageShell
        title="Tasks and assignments"
        meta="Work given to the team, with a deadline and the evidence it was done."
        actions={<Can permission="smois.tasks.manage"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>New task</button></Can>}
      >
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Status</span>
            <select className="adm-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUIRED', 'COMPLETED', 'CANCELLED'].map((s) => <option key={s} value={s}>{human(s)}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', paddingBottom: 8 }}>
            <input type="checkbox" className="adm-checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Overdue only
          </label>
        </Toolbar>
        <Async state={state} columns={5}>
          {(page) =>
            page.data.length === 0 ? (
              <EmptyState title="No tasks" description={canManage ? 'Create a task to assign work to a team member.' : 'Nothing is assigned to you.'} />
            ) : (
              <SimpleTable head={['Task', 'Assigned to', 'Status', 'Due', '']}>
                {page.data.map((t) => {
                  const late = !['COMPLETED', 'CANCELLED'].includes(t.status) && !!t.dueAt && new Date(t.dueAt) < new Date();
                  return (
                    <tr key={t.id} className="adm-tr">
                      <Td sub={`${human(t.type)} · ${t.priority.toLowerCase()} priority${t.account ? ` · ${t.account.name}` : ''}`}>
                        {t.title}
                        {t.evidenceUrl && <span className="adm-td-sub"><a className="adm-link" href={t.evidenceUrl} target="_blank" rel="noreferrer">Evidence</a>{t.evidenceNote ? ` · ${t.evidenceNote}` : ''}</span>}
                        {!t.evidenceUrl && t.evidenceNote && <span className="adm-td-sub">Evidence: {t.evidenceNote}</span>}
                        {t.reviewNote && <span className="adm-td-sub">Review: {t.reviewNote}</span>}
                      </Td>
                      <Td sub={`Set by ${t.createdByName}`}>{t.assigneeName}</Td>
                      <Td><StatusBadge value={t.status} /></Td>
                      <Td>{t.dueAt ? <span style={late ? { color: 'var(--error)' } : undefined}>{late ? 'Overdue · ' : ''}{formatDateTime(t.dueAt)}</span> : <span className="adm-muted">No date</span>}</Td>
                      <td className="adm-td adm-td--right">
                        <TaskActions task={t} canManage={canManage} canWork={canWork} onMove={(to) => setMoving({ task: t, to })} />
                      </td>
                    </tr>
                  );
                })}
              </SimpleTable>
            )
          }
        </Async>
        {creating && <NewTask onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
        {moving && <MoveTask {...moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function TaskActions({ task, canManage, canWork, onMove }: { task: Task; canManage: boolean; canWork: boolean; onMove: (to: string) => void }) {
  const { adminId } = useAdminSession();
  const mine = task.assigneeId === adminId;
  const btn = (to: string, label: string, primary = false, danger = false) => (
    <button key={to} type="button" className={`adm-btn adm-btn--sm${primary ? ' adm-btn--primary' : ''}${danger ? ' adm-btn--danger' : ''}`} onClick={() => onMove(to)}>{label}</button>
  );
  const out = [];
  if (canWork && mine) {
    if (task.status === 'PENDING') out.push(btn('ACCEPTED', 'Accept', true));
    if (task.status === 'ACCEPTED' || task.status === 'REVISION_REQUIRED') out.push(btn('IN_PROGRESS', 'Start', true));
    if (task.status === 'IN_PROGRESS') out.push(btn('SUBMITTED', 'Submit evidence', true));
  }
  if (canManage) {
    if (task.status === 'SUBMITTED') out.push(btn('COMPLETED', 'Approve', true), btn('REVISION_REQUIRED', 'Send back'));
    if (!['COMPLETED', 'CANCELLED'].includes(task.status)) out.push(btn('CANCELLED', 'Cancel', false, true));
  }
  return <div className="adm-row-actions">{out}</div>;
}

function MoveTask({ task, to, onClose, onDone }: { task: Task; to: string; onClose: () => void; onDone: () => void }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const submitting = to === 'SUBMITTED';
  const noteNeeded = to === 'REVISION_REQUIRED';
  return (
    <FormModal title={`${task.title}: ${human(to)}`} onClose={onClose} submitLabel="Confirm" disabled={(submitting && !url && !note.trim()) || (noteNeeded && note.trim().length < 3)}
      onSubmit={async () => {
        await sendJson('POST', `/smois/tasks/${task.id}/transition`, {
          to,
          ...(submitting ? { evidenceUrl: url || null, evidenceNote: note || null } : { reviewNote: note || null })
        });
        onDone();
      }}>
      {submitting && <TextField label="Link to the evidence (post URL, file, report)" type="url" value={url} onChange={setUrl} />}
      {(submitting || to === 'COMPLETED' || noteNeeded) && (
        <TextArea label={submitting ? 'What was delivered?' : noteNeeded ? 'What needs to change?' : 'Note (optional)'} value={note} onChange={setNote} rows={3} />
      )}
      {!submitting && !noteNeeded && to !== 'COMPLETED' && <p className="adm-muted">Move this task to {human(to)}?</p>}
    </FormModal>
  );
}

function NewTask({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const team = useTeam();
  const accounts = useAccounts();
  const [f, setF] = useState({ title: '', description: '', type: 'GENERAL', priority: 'MEDIUM', assigneeId: '', accountId: '', dueAt: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <FormModal title="New task" onClose={onClose} submitLabel="Assign task" disabled={f.title.trim().length < 2 || !f.assigneeId}
      onSubmit={async () => {
        await sendJson('POST', '/smois/tasks', {
          ...f, description: f.description || null, accountId: f.accountId || null, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null
        });
        onDone();
      }}>
      <TextField label="Title" value={f.title} onChange={set('title')} required />
      <TextArea label="Description / expected deliverable" value={f.description} onChange={set('description')} rows={3} />
      <SelectField label="Assign to" value={f.assigneeId} onChange={set('assigneeId')} required
        options={[{ value: '', label: team.loading ? 'Loading…' : 'Choose…' }, ...(team.data?.data ?? []).map((m) => ({ value: m.id, label: `${m.name} · ${m.smosRole ?? m.role}` }))]} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <SelectField label="Type" value={f.type} onChange={set('type')} options={TYPES.map((x) => ({ value: x, label: human(x) }))} />
        <SelectField label="Priority" value={f.priority} onChange={set('priority')} options={['LOW', 'MEDIUM', 'HIGH'].map((x) => ({ value: x, label: x.toLowerCase() }))} />
      </div>
      <SelectField label="Account (optional)" value={f.accountId} onChange={set('accountId')}
        options={[{ value: '', label: 'None' }, ...(accounts.data?.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
      <TextField label="Deadline" type="datetime-local" value={f.dueAt} onChange={set('dueAt')} />
    </FormModal>
  );
}
