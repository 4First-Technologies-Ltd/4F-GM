'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { formatNaira } from '@/admin/primitives/format';
import { sendJson } from '@/lib/post';
import { Async, FormModal, ManualNote, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, daysAgoIso, fmt, todayIso, toInt, useApi } from '../_ui';

interface Campaign {
  id: string; name: string; type: string; objective: string | null; description: string | null; status: string; ownerName: string;
  startDate: string; endDate: string; targetAudience: string | null; budget: number | null; spend: number | null; leads: number | null;
  expectedResults: string | null; actualResults: string | null; lessons: string | null; _count: { content: number };
}
interface Results {
  posts: number; postsWithFigures: number; reach: number | null; impressions: number | null; clicks: number | null; videoViews: number | null;
  engagement: number | null; costPerLead: number | null; note: string;
}

const STATUSES = ['PLANNING', 'BRIEFING', 'PREPARATION', 'APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];
const TYPES = ['BRAND_AWARENESS', 'PRODUCT_LAUNCH', 'LEAD_GENERATION', 'ENGAGEMENT', 'RECRUITMENT', 'EVENT', 'PARTNERSHIP', 'SALES_PROMOTION', 'PUBLIC_RELATIONS', 'EDUCATION'];
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();

export default function CampaignsPage() {
  const state = useApi<{ data: Campaign[] }>('/smois/campaigns');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<Campaign | null>(null);
  return (
    <RequirePermission permission="smois.read">
      <PageShell title="Campaigns" meta="From plan to results. Posts are linked to a campaign from their content page."
        actions={<Can permission="smois.campaigns.manage"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>New campaign</button></Can>}>
        <Async state={state} columns={5}>
          {({ data }) => data.length === 0 ? <EmptyState title="No campaigns" description="Management creates campaigns and tracks them here." /> : (
            <SimpleTable head={['Campaign', 'Dates', 'Status', 'Budget / spend', 'Posts']}>
              {data.map((c) => (
                <tr key={c.id} className="adm-tr" style={{ cursor: 'pointer' }} onClick={() => setOpen(c)}>
                  <Td sub={`${human(c.type)} · owner ${c.ownerName}`}><button type="button" className="adm-link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setOpen(c)}>{c.name}</button></Td>
                  <Td>{c.startDate} to {c.endDate}</Td>
                  <Td><StatusBadge value={c.status} /></Td>
                  <Td>{c.budget != null ? formatNaira(c.budget) : '—'} / {c.spend != null ? formatNaira(c.spend) : '—'}</Td>
                  <Td>{c._count.content}</Td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </Async>
        {creating && <CampaignForm onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
        {open && <CampaignDetail c={open} onClose={() => setOpen(null)} onChanged={state.reload} />}
      </PageShell>
    </RequirePermission>
  );
}

function CampaignForm({ existing, onClose, onDone }: { existing?: Campaign; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: existing?.name ?? '', type: existing?.type ?? 'BRAND_AWARENESS', objective: existing?.objective ?? '', targetAudience: existing?.targetAudience ?? '',
    startDate: existing?.startDate ?? todayIso(), endDate: existing?.endDate ?? daysAgoIso(-30), budget: existing?.budget?.toString() ?? '',
    spend: existing?.spend?.toString() ?? '', leads: existing?.leads?.toString() ?? '', expectedResults: existing?.expectedResults ?? '',
    actualResults: existing?.actualResults ?? '', lessons: existing?.lessons ?? ''
  });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const n = (v: string) => v.trim() || null;
  return (
    <FormModal wide title={existing ? 'Edit campaign' : 'New campaign'} onClose={onClose} submitLabel="Save" disabled={f.name.trim().length < 2}
      onSubmit={async () => {
        const body = {
          name: f.name, type: f.type, objective: n(f.objective), targetAudience: n(f.targetAudience), startDate: f.startDate, endDate: f.endDate,
          budget: toInt(f.budget), spend: toInt(f.spend), leads: toInt(f.leads), expectedResults: n(f.expectedResults), actualResults: n(f.actualResults), lessons: n(f.lessons)
        };
        if (existing) await sendJson('PATCH', `/smois/campaigns/${existing.id}`, body);
        else await sendJson('POST', '/smois/campaigns', body);
        onDone();
      }}>
      <TextField label="Name" value={f.name} onChange={set('name')} required />
      <SelectField label="Type" value={f.type} onChange={set('type')} options={TYPES.map((x) => ({ value: x, label: human(x) }))} />
      <TextArea label="Objective" value={f.objective} onChange={set('objective')} rows={2} />
      <TextField label="Target audience" value={f.targetAudience} onChange={set('targetAudience')} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <TextField label="Starts" type="date" value={f.startDate} onChange={set('startDate')} required />
        <TextField label="Ends" type="date" value={f.endDate} onChange={set('endDate')} required />
        <TextField label="Budget (₦)" type="number" value={f.budget} onChange={set('budget')} />
        <TextField label="Spent so far (₦)" type="number" value={f.spend} onChange={set('spend')} />
        <TextField label="Leads" type="number" value={f.leads} onChange={set('leads')} />
      </div>
      <TextArea label="Expected results" value={f.expectedResults} onChange={set('expectedResults')} rows={2} />
      <TextArea label="Actual results" value={f.actualResults} onChange={set('actualResults')} rows={2} />
      <TextArea label="Lessons learned" value={f.lessons} onChange={set('lessons')} rows={2} />
    </FormModal>
  );
}

function CampaignDetail({ c, onClose, onChanged }: { c: Campaign; onClose: () => void; onChanged: () => void }) {
  const results = useApi<Results>(`/smois/campaigns/${c.id}/results`);
  const [editing, setEditing] = useState(false);
  return (
    <Modal wide title={c.name} onClose={onClose} footer={<button type="button" className="adm-btn" onClick={onClose}>Close</button>}>
      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        <p className="adm-muted">{human(c.type)} · {c.startDate} to {c.endDate} · <StatusBadge value={c.status} /></p>
        {c.objective && <p>{c.objective}</p>}
        <Can permission="smois.campaigns.manage">
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'end' }}>
            <label className="adm-field"><span className="adm-field-label">Status</span>
              <select className="adm-input" value={c.status} onChange={async (e) => { await sendJson('PATCH', `/smois/campaigns/${c.id}`, { status: e.target.value }); onChanged(); onClose(); }}>
                {STATUSES.map((s) => <option key={s} value={s}>{human(s)}</option>)}
              </select>
            </label>
            <button type="button" className="adm-btn" onClick={() => setEditing(true)}>Edit details</button>
          </div>
        </Can>
        <h4 className="adm-micro-label">Results from linked posts</h4>
        <Async state={results} columns={2}>
          {(r) => (
            <>
              <SimpleTable head={['Measure', 'Value']}>
                <tr className="adm-tr"><Td>Posts linked</Td><Td>{r.posts} ({r.postsWithFigures} with figures)</Td></tr>
                <tr className="adm-tr"><Td>Reach</Td><Td>{fmt(r.reach)}</Td></tr>
                <tr className="adm-tr"><Td>Impressions</Td><Td>{fmt(r.impressions)}</Td></tr>
                <tr className="adm-tr"><Td>Engagement actions</Td><Td>{fmt(r.engagement)}</Td></tr>
                <tr className="adm-tr"><Td>Link clicks</Td><Td>{fmt(r.clicks)}</Td></tr>
                <tr className="adm-tr"><Td>Leads / cost per lead</Td><Td>{fmt(c.leads)} / {r.costPerLead != null ? formatNaira(r.costPerLead) : '—'}</Td></tr>
              </SimpleTable>
              <p className="adm-filter-note">{r.note}</p>
            </>
          )}
        </Async>
        {c.actualResults && <p><strong>Actual results:</strong> {c.actualResults}</p>}
        {c.lessons && <p><strong>Lessons:</strong> {c.lessons}</p>}
        <ManualNote />
        {editing && <CampaignForm existing={c} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChanged(); onClose(); }} />}
      </div>
    </Modal>
  );
}
