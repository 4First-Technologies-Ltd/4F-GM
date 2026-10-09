'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { ConfirmDialog, Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { ErrorState, LoadingBlock } from '@/admin/primitives/states';
import { formatDateTime, formatNumber, humaniseEnum } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import type {
  CampaignRecipientRow,
  CampaignRow,
  SegmentFilter,
  SegmentRow,
  UserRole,
  VendorStatus
} from '@/admin/modules/types';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'CONSUMER', label: 'Consumers' },
  { value: 'VENDOR', label: 'Vendors' },
  { value: 'RIDER', label: 'Riders' }
];

interface Preview {
  count: number;
  sample: { name: string; email: string }[];
}

/** Count and sample of who a filter reaches right now. */
function usePreview(filter: SegmentFilter | null) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(filter);

  useEffect(() => {
    if (!filter) {
      setPreview(null);
      return;
    }
    setPreview(null);
    setError(null);
    const t = window.setTimeout(() => {
      sendJson<Preview>('POST', '/marketing/segments/preview', { filter })
        .then(setPreview)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { preview, error };
}

function PreviewLine({ preview, error }: { preview: Preview | null; error: string | null }) {
  if (error) return <span className="adm-field-error">{error}</span>;
  if (!preview) return <span className="adm-muted">Counting…</span>;
  return (
    <span className="adm-field-help">
      <strong>{formatNumber(preview.count)}</strong> eligible recipient{preview.count === 1 ? '' : 's'} (verified, active,
      not unsubscribed)
      {preview.sample.length > 0 && <> — e.g. {preview.sample.map((s) => s.email).join(', ')}</>}
    </span>
  );
}

/* --------------------------------------------------------------- segment --- */

export function SegmentModal({
  segment,
  onClose,
  onSaved
}: {
  segment: SegmentRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? '');
  const [description, setDescription] = useState(segment?.description ?? '');
  const [filter, setFilter] = useState<SegmentFilter>(segment?.filter ?? { roles: [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { preview, error: previewError } = usePreview(filter);

  const toggleRole = (r: UserRole) =>
    setFilter((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = { name, description: description || null, filter };
      if (segment) await sendJson('PATCH', `/marketing/segments/${segment.id}`, body);
      else await sendJson('POST', '/marketing/segments', body);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={segment ? 'Edit audience' : 'New audience'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={busy || name.trim().length < 2} onClick={save}>
            {busy ? 'Saving…' : 'Save audience'}
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
          <span className="adm-field-label">Name</span>
          <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Approved vendors in Lagos" />
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Description (optional)</span>
          <input className="adm-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="adm-field-label">Who</legend>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {ROLES.map((r) => (
              <label key={r.value} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <input type="checkbox" className="adm-checkbox" checked={filter.roles.includes(r.value)} onChange={() => toggleRole(r.value)} />
                {r.label}
              </label>
            ))}
          </div>
          <span className="adm-field-help">Leave all unticked to include every kind of account.</span>
        </fieldset>

        <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          <label className="adm-field">
            <span className="adm-field-label">Vendor approval</span>
            <select
              className="adm-input"
              value={filter.vendorStatus ?? ''}
              onChange={(e) => setFilter({ ...filter, vendorStatus: (e.target.value || undefined) as VendorStatus | undefined })}
            >
              <option value="">Any</option>
              {(['APPROVED', 'PENDING', 'REJECTED'] as const).map((s) => (
                <option key={s} value={s}>
                  {humaniseEnum(s)}
                </option>
              ))}
            </select>
            <span className="adm-field-help">Only narrows vendors.</span>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Vendor state</span>
            <input className="adm-input" value={filter.state ?? ''} placeholder="e.g. Lagos" onChange={(e) => setFilter({ ...filter, state: e.target.value || undefined })} />
            <span className="adm-field-help">Limits the audience to vendors in this state.</span>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Has placed an order</span>
            <select
              className="adm-input"
              value={filter.hasOrdered === undefined ? '' : filter.hasOrdered ? 'yes' : 'no'}
              onChange={(e) => setFilter({ ...filter, hasOrdered: e.target.value === '' ? undefined : e.target.value === 'yes' })}
            >
              <option value="">Either</option>
              <option value="yes">Yes</option>
              <option value="no">No, never</option>
            </select>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Joined in the last (days)</span>
            <input
              type="number"
              min={1}
              className="adm-input"
              value={filter.joinedWithinDays ?? ''}
              onChange={(e) => setFilter({ ...filter, joinedWithinDays: e.target.value ? Number(e.target.value) : undefined })}
            />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">CRM tag</span>
            <input className="adm-input" value={filter.tag ?? ''} placeholder="e.g. vip" onChange={(e) => setFilter({ ...filter, tag: e.target.value || undefined })} />
          </label>
        </div>

        <PreviewLine preview={preview} error={previewError} />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- campaign --- */

export function CampaignModal({
  campaignId,
  segments,
  onClose,
  onChanged
}: {
  /** null = a new campaign. */
  campaignId: string | null;
  segments: SegmentRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const canManage = usePermission('marketing.manage');
  const [id, setId] = useState(campaignId);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body: '', segmentId: '' });
  const [failures, setFailures] = useState<CampaignRecipientRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    getJson<{ campaign: CampaignRow }>(`/marketing/campaigns/${id}`)
      .then(({ campaign: c }) => {
        setCampaign(c);
        setForm((f) => (c.status === 'DRAFT' && f.name ? f : { name: c.name, subject: c.subject, body: c.body, segmentId: c.segmentId ?? '' }));
        setLoadError(null);
        if (c.failedCount > 0) {
          getJson<{ data: CampaignRecipientRow[] }>(`/marketing/campaigns/${c.id}/recipients?status=FAILED&limit=10`)
            .then((r) => setFailures(r.data))
            .catch(() => setFailures([]));
        } else {
          setFailures([]);
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e : new Error(String(e))));
  }, [id]);
  useEffect(load, [load]);

  // Progress while a send is under way.
  const sending = campaign?.status === 'SENDING';
  useEffect(() => {
    if (!sending) return;
    const t = window.setInterval(() => {
      load();
      onChanged();
    }, 4000);
    return () => window.clearInterval(t);
  }, [sending, load, onChanged]);

  const editable = canManage && (!campaign || campaign.status === 'DRAFT');
  const segment = segments.find((s) => s.id === form.segmentId) ?? null;
  const { preview, error: previewError } = usePreview(editable && segment ? segment.filter : null);
  const dirty = !campaign
    ? form.name !== '' || form.subject !== '' || form.body !== ''
    : form.name !== campaign.name || form.subject !== campaign.subject || form.body !== campaign.body || form.segmentId !== (campaign.segmentId ?? '');
  const complete = form.name.trim().length >= 2 && form.subject.trim().length >= 2 && form.body.trim().length >= 5;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    act(async () => {
      const body = { name: form.name, subject: form.subject, body: form.body, segmentId: form.segmentId || null };
      if (id) {
        await sendJson('PATCH', `/marketing/campaigns/${id}`, body);
      } else {
        const { campaign: created } = await sendJson<{ campaign: CampaignRow }>('POST', '/marketing/campaigns', body);
        setId(created.id);
      }
      setNotice('Draft saved.');
      onChanged();
      load();
    });

  const progress = campaign && campaign.audienceSize > 0 ? Math.round(((campaign.sentCount + campaign.failedCount) / campaign.audienceSize) * 100) : 0;

  return (
    <Modal title={campaign?.name ?? 'New campaign'} onClose={onClose} wide>
      {loadError ? (
        <ErrorState title="Could not load this campaign" error={loadError} onRetry={load} />
      ) : id && !campaign ? (
        <LoadingBlock height={240} />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {error && (
            <div className="adm-inline-error" role="alert">
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="adm-alert" role="status">
              {notice}
            </div>
          )}

          {campaign && campaign.status !== 'DRAFT' && (
            <section className="adm-detail-section">
              <h3 className="adm-micro-label">Delivery</h3>
              <p style={{ margin: 0 }}>
                <StatusBadge value={campaign.status} /> {formatNumber(campaign.sentCount)} of {formatNumber(campaign.audienceSize)} sent
                {campaign.failedCount > 0 && <>, {formatNumber(campaign.failedCount)} failed</>}
                {campaign.status === 'CANCELLED' && campaign.pendingCount ? <>, {formatNumber(campaign.pendingCount)} never sent</> : null}
              </p>
              {sending && <progress value={progress} max={100} style={{ width: '100%' }} aria-label="Send progress" />}
              <p className="adm-muted" style={{ margin: 0 }}>
                {campaign.startedAt && <>Started {formatDateTime(campaign.startedAt)}</>}
                {campaign.sentAt && <> · finished {formatDateTime(campaign.sentAt)}</>} · by {campaign.createdByName}
              </p>
              {failures.length > 0 && (
                <>
                  <h4 className="adm-micro-label">Failures{campaign.failedCount > failures.length ? ` (first ${failures.length})` : ''}</h4>
                  <ul className="adm-doc-list">
                    {failures.map((f) => (
                      <li key={f.id} className="adm-doc-item">
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          {f.email}
                          <span className="adm-td-sub">{f.error ?? 'Unknown error'}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <label className="adm-field">
            <span className="adm-field-label">Campaign name (internal)</span>
            <input className="adm-input" value={form.name} disabled={!editable} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Subject line</span>
            <input className="adm-input" value={form.subject} disabled={!editable} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Message</span>
            <textarea className="adm-input" rows={9} value={form.body} disabled={!editable} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <span className="adm-field-help">
              Plain text — a blank line starts a new paragraph. Use {'{{name}}'} for the recipient’s first name. An unsubscribe link is added
              automatically.
            </span>
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Audience</span>
            <select className="adm-input" value={form.segmentId} disabled={!editable} onChange={(e) => setForm({ ...form, segmentId: e.target.value })}>
              <option value="">Choose an audience…</option>
              {segments.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {editable && segment && <PreviewLine preview={preview} error={previewError} />}
            {editable && segments.length === 0 && <span className="adm-field-help">Create an audience in the Audiences tab first.</span>}
          </label>

          {canManage && campaign && campaign.status !== 'SENDING' && (
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'end' }}>
              <label className="adm-field" style={{ flex: '1 1 220px' }}>
                <span className="adm-field-label">Send a test to</span>
                <input type="email" className="adm-input" value={testTo} placeholder="you@example.com" onChange={(e) => setTestTo(e.target.value)} />
              </label>
              <button
                type="button"
                className="adm-btn"
                disabled={busy || dirty || !/\S+@\S+\.\S+/.test(testTo)}
                title={dirty ? 'Save the draft first — the test sends what is saved' : undefined}
                onClick={() =>
                  act(async () => {
                    await sendJson('POST', `/marketing/campaigns/${id}/test`, { to: testTo });
                    setNotice(`Test sent to ${testTo}.`);
                  })
                }
              >
                Send test
              </button>
            </div>
          )}

          <div className="adm-dialog-actions">
            {canManage && campaign && campaign.status !== 'SENDING' && (
              <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
            {canManage && sending && (
              <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirmCancel(true)}>
                Cancel sending
              </button>
            )}
            {editable && (
              <>
                <button type="button" className="adm-btn" disabled={busy || !dirty || !complete} onClick={save}>
                  Save draft
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--primary"
                  disabled={busy || !campaign || dirty || !form.segmentId || !preview || preview.count === 0}
                  title={!campaign || dirty ? 'Save the draft before sending' : !form.segmentId ? 'Choose an audience' : undefined}
                  onClick={() => setConfirmSend(true)}
                >
                  Send…
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {confirmSend && campaign && preview && (
        <ConfirmDialog
          title={`Send to ${formatNumber(preview.count)} people?`}
          body={`“${campaign.subject}” will go to everyone in “${segment?.name}” right now. The recipient list is fixed at the moment you send, and a sent email cannot be recalled. You can cancel a send in progress, but emails already delivered stay delivered.`}
          confirmLabel={`Send to ${formatNumber(preview.count)}`}
          onCancel={() => setConfirmSend(false)}
          onConfirm={async () => {
            await sendJson('POST', `/marketing/campaigns/${campaign.id}/send`);
            setConfirmSend(false);
            onChanged();
            load();
          }}
        />
      )}
      {confirmCancel && campaign && (
        <ConfirmDialog
          title="Stop sending?"
          body="Emails already delivered stay delivered. Everyone not yet reached will not receive this campaign, and it cannot be resumed."
          confirmLabel="Stop sending"
          danger
          onCancel={() => setConfirmCancel(false)}
          onConfirm={async () => {
            await sendJson('POST', `/marketing/campaigns/${campaign.id}/cancel`);
            setConfirmCancel(false);
            onChanged();
            load();
          }}
        />
      )}
      {confirmDelete && campaign && (
        <ConfirmDialog
          title={`Delete “${campaign.name}”?`}
          body={campaign.status === 'DRAFT' ? 'The draft is removed.' : 'The campaign and its delivery record are removed permanently.'}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await sendJson('DELETE', `/marketing/campaigns/${campaign.id}`);
            onChanged();
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
