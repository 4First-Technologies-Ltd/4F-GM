'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { ConfirmDialog, Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { ErrorState, LoadingBlock } from '@/admin/primitives/states';
import { formatDateTime, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import type { LeadDetail, LeadRow, LeadSource, LeadStage, LeadType } from '@/admin/modules/types';

const STAGE_ORDER: LeadStage[] = ['NEW', 'CONTACTED', 'ONBOARDING', 'WON', 'LOST'];
const SOURCES: LeadSource[] = ['REFERRAL', 'OUTREACH', 'WEBSITE', 'SOCIAL', 'EVENT', 'OTHER'];

/** `<input type="datetime-local">` value <-> ISO string. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/* ------------------------------------------------------------- new lead --- */

export function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    type: 'VENDOR' as LeadType,
    source: 'OUTREACH' as LeadSource,
    contactName: '',
    phone: '',
    email: '',
    state: '',
    city: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { lead } = await sendJson<{ lead: LeadRow }>('POST', '/crm/leads', form);
      onCreated(lead.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New lead"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={busy || form.name.trim().length < 2} onClick={submit}>
            {busy ? 'Adding…' : 'Add lead'}
          </button>
        </>
      }
    >
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <LeadFields form={form} set={set} />
    </Modal>
  );
}

function LeadFields({
  form,
  set,
  disabled = false
}: {
  form: { name: string; type: LeadType; source: LeadSource; contactName: string; phone: string; email: string; state: string; city: string };
  set: <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
      <label className="adm-field" style={{ gridColumn: '1 / -1' }}>
        <span className="adm-field-label">Business or person</span>
        <input className="adm-input" value={form.name} disabled={disabled} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">Type</span>
        <select className="adm-input" value={form.type} disabled={disabled} onChange={(e) => set('type', e.target.value as LeadType)}>
          <option value="VENDOR">Vendor</option>
          <option value="RIDER">Rider</option>
        </select>
      </label>
      <label className="adm-field">
        <span className="adm-field-label">Source</span>
        <select className="adm-input" value={form.source} disabled={disabled} onChange={(e) => set('source', e.target.value as LeadSource)}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {humaniseEnum(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="adm-field">
        <span className="adm-field-label">Contact name</span>
        <input className="adm-input" value={form.contactName} disabled={disabled} onChange={(e) => set('contactName', e.target.value)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">Phone</span>
        <input className="adm-input" value={form.phone} disabled={disabled} onChange={(e) => set('phone', e.target.value)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">Email</span>
        <input type="email" className="adm-input" value={form.email} disabled={disabled} onChange={(e) => set('email', e.target.value)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">State</span>
        <input className="adm-input" value={form.state} disabled={disabled} onChange={(e) => set('state', e.target.value)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">City</span>
        <input className="adm-input" value={form.city} disabled={disabled} onChange={(e) => set('city', e.target.value)} />
      </label>
    </div>
  );
}

/* ------------------------------------------------------------ lead modal --- */

export function LeadModal({
  leadId,
  onClose,
  onChanged
}: {
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const canManage = usePermission('crm.manage');
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string; type: LeadType; source: LeadSource; contactName: string; phone: string; email: string; state: string; city: string;
  } | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [lostFor, setLostFor] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activityType, setActivityType] = useState<'NOTE' | 'CALL' | 'MESSAGE' | 'MEETING'>('NOTE');
  const [activityBody, setActivityBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  const load = useCallback(() => {
    getJson<{ lead: LeadDetail }>(`/crm/leads/${leadId}`)
      .then(({ lead: l }) => {
        setLead(l);
        setForm({
          name: l.name, type: l.type, source: l.source, contactName: l.contactName ?? '', phone: l.phone ?? '',
          email: l.email ?? '', state: l.state ?? '', city: l.city ?? ''
        });
        setFollowUp(toLocalInput(l.nextFollowUpAt));
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [leadId]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
      onChanged();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) => run(() => sendJson('PATCH', `/crm/leads/${leadId}`, body));

  const dirty =
    lead && form
      ? form.name !== lead.name || form.type !== lead.type || form.source !== lead.source ||
        form.contactName !== (lead.contactName ?? '') || form.phone !== (lead.phone ?? '') ||
        form.email !== (lead.email ?? '') || form.state !== (lead.state ?? '') || form.city !== (lead.city ?? '') ||
        followUp !== toLocalInput(lead.nextFollowUpAt)
      : false;

  return (
    <Modal title={lead?.name ?? 'Lead'} onClose={onClose} wide>
      {error ? (
        <ErrorState title="Could not load this lead" error={error} onRetry={load} />
      ) : !lead || !form ? (
        <LoadingBlock height={240} />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-5)' }}>
          {actionError && (
            <div className="adm-inline-error" role="alert">
              <span>{actionError}</span>
            </div>
          )}

          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Stage</h3>
            <div className="adm-segmented" role="group" aria-label="Stage">
              {STAGE_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="adm-segment"
                  aria-pressed={lead.stage === s}
                  disabled={!canManage || busy}
                  onClick={() => {
                    if (s === lead.stage) return;
                    if (s === 'LOST') setLostFor(true);
                    else patch({ stage: s });
                  }}
                >
                  {humaniseEnum(s)}
                </button>
              ))}
            </div>
            {lead.stage === 'LOST' && lead.lostReason && <p className="adm-muted">Lost: {lead.lostReason}</p>}
            {lead.stage === 'WON' && (
              <p className="adm-muted">
                {lead.convertedUserId
                  ? 'Linked to their account.'
                  : 'No matching account found yet. Add their signup email so it can link.'}
              </p>
            )}
            <p className="adm-muted">
              Owner: {lead.ownerName ?? 'nobody'} · created {formatRelative(lead.createdAt)}
              {canManage && (
                <>
                  {' · '}
                  <button type="button" className="adm-link" onClick={() => patch({ owner: lead.ownerId ? null : 'me' })}>
                    {lead.ownerId ? 'Release' : 'Take ownership'}
                  </button>
                </>
              )}
            </p>
          </section>

          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Details</h3>
            <LeadFields form={form} set={(k, v) => setForm({ ...form, [k]: v })} disabled={!canManage} />
            <label className="adm-field" style={{ marginTop: 'var(--space-4)' }}>
              <span className="adm-field-label">Next follow-up</span>
              <input
                type="datetime-local"
                className="adm-input"
                value={followUp}
                disabled={!canManage || lead.stage === 'WON' || lead.stage === 'LOST'}
                onChange={(e) => setFollowUp(e.target.value)}
              />
            </label>
            {canManage && (
              <div className="adm-dialog-actions">
                <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirmDelete(true)}>
                  Delete lead
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--primary"
                  disabled={!dirty || busy || form.name.trim().length < 2}
                  onClick={() => patch({ ...form, nextFollowUpAt: fromLocalInput(followUp) })}
                >
                  Save changes
                </button>
              </div>
            )}
          </section>

          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Tasks ({lead.tasks.filter((t) => t.status === 'OPEN').length} open)</h3>
            {lead.tasks.length > 0 && (
              <ul className="adm-doc-list">
                {lead.tasks.map((t) => (
                  <li key={t.id} className="adm-doc-item">
                    <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        className="adm-checkbox"
                        checked={t.status === 'DONE'}
                        disabled={!canManage || busy}
                        onChange={(e) => run(() => sendJson('PATCH', `/crm/tasks/${t.id}`, { status: e.target.checked ? 'DONE' : 'OPEN' }))}
                      />
                      <span style={{ overflowWrap: 'anywhere', textDecoration: t.status === 'DONE' ? 'line-through' : undefined }}>
                        {t.title}
                      </span>
                    </label>
                    <span className="adm-muted">{t.dueAt ? formatDateTime(t.dueAt) : 'No date'}</span>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  className="adm-input"
                  placeholder="Add a follow-up task…"
                  aria-label="New task"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                />
                <button
                  type="button"
                  className="adm-btn"
                  disabled={busy || taskTitle.trim().length < 2}
                  onClick={() =>
                    run(async () => {
                      await sendJson('POST', '/crm/tasks', { title: taskTitle, leadId });
                      setTaskTitle('');
                    })
                  }
                >
                  Add
                </button>
              </div>
            )}
          </section>

          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Timeline</h3>
            {canManage && (
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <div className="adm-segmented" role="group" aria-label="Activity type">
                  {(['NOTE', 'CALL', 'MESSAGE', 'MEETING'] as const).map((t) => (
                    <button key={t} type="button" className="adm-segment" aria-pressed={activityType === t} onClick={() => setActivityType(t)}>
                      {humaniseEnum(t)}
                    </button>
                  ))}
                </div>
                <textarea
                  className="adm-input"
                  rows={3}
                  aria-label="Activity"
                  placeholder="What happened?"
                  value={activityBody}
                  onChange={(e) => setActivityBody(e.target.value)}
                />
                <div className="adm-dialog-actions">
                  <button
                    type="button"
                    className="adm-btn adm-btn--primary"
                    disabled={busy || !activityBody.trim()}
                    onClick={() =>
                      run(async () => {
                        await sendJson('POST', `/crm/leads/${leadId}/activities`, { type: activityType, body: activityBody });
                        setActivityBody('');
                      })
                    }
                  >
                    Log {activityType.toLowerCase()}
                  </button>
                </div>
              </div>
            )}
            <ul className="adm-doc-list">
              {lead.activities.map((a) => (
                <li key={a.id} className="adm-doc-item">
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                    {a.type !== 'NOTE' && <StatusBadge value={a.type} />} {a.body}
                    <span className="adm-td-sub">{a.authorName}</span>
                  </span>
                  <span className="adm-muted" title={formatDateTime(a.createdAt)}>
                    {formatRelative(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {lostFor && (
        <Modal
          title="Why was this lead lost?"
          onClose={() => setLostFor(false)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setLostFor(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={lostReason.trim().length < 3}
                onClick={() => {
                  setLostFor(false);
                  patch({ stage: 'LOST', lostReason });
                  setLostReason('');
                }}
              >
                Mark lost
              </button>
            </>
          }
        >
          <input
            className="adm-input"
            aria-label="Reason"
            placeholder="e.g. already supplies through a competitor"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
          />
        </Modal>
      )}

      {confirmDelete && lead && (
        <ConfirmDialog
          title={`Delete ${lead.name}?`}
          body="The lead, its timeline and its tasks are removed permanently. Moving it to Lost keeps the history instead."
          confirmLabel="Delete lead"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await sendJson('DELETE', `/crm/leads/${leadId}`);
            onChanged();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
