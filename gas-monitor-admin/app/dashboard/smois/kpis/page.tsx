'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, PageShell, SelectField, SimpleTable, Td, TextField, daysAgoIso, fmt, fmtPct, todayIso, useAccounts, useApi, useTeam
} from '../_ui';

interface Kpi {
  id: string; name: string; metric: string; targetValue: number; periodStart: string; periodEnd: string;
  assigneeName: string | null; account: { name: string } | null; actual: number | null; achievedPct: number | null; status: string;
}

const METRICS: Record<string, string> = {
  FOLLOWER_GROWTH: 'Net follower growth',
  REACH: 'Reach',
  IMPRESSIONS: 'Impressions',
  ENGAGEMENT: 'Engagement actions',
  POSTS_PUBLISHED: 'Posts published',
  TASK_COMPLETION: 'Task completion rate (%)'
};

export default function KpisPage() {
  const state = useApi<{ data: Kpi[] }>('/smois/kpis');
  const [creating, setCreating] = useState(false);

  return (
    <RequirePermission permission="smois.read">
      <PageShell
        title="Targets"
        meta="Goals set by management, measured against what the system has recorded."
        actions={<Can permission="smois.kpi.manage"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>New target</button></Can>}
      >
        <Async state={state} columns={6}>
          {({ data }) =>
            data.length === 0 ? (
              <EmptyState title="No targets set" description="Management sets targets such as follower growth or posts published for a period." />
            ) : (
              <SimpleTable head={['Target', 'Period', 'Goal', 'Actual', 'Achieved', 'Status', '']}>
                {data.map((k) => (
                  <tr key={k.id} className="adm-tr">
                    <Td sub={`${METRICS[k.metric] ?? k.metric}${k.account ? ` · ${k.account.name}` : ' · all accounts'}${k.assigneeName ? ` · ${k.assigneeName}` : ' · whole team'}`}>{k.name}</Td>
                    <Td>{k.periodStart} to {k.periodEnd}</Td>
                    <Td>{fmt(k.targetValue)}</Td>
                    <Td>{k.actual == null ? <span className="adm-muted">No data</span> : fmt(k.actual)}</Td>
                    <Td>{k.achievedPct != null ? (
                      <>
                        {fmtPct(k.achievedPct)}
                        <progress className="adm-progress" max={100} value={Math.min(100, k.achievedPct)} aria-label={`${k.achievedPct}% of target`} />
                      </>
                    ) : '—'}</Td>
                    <Td><StatusBadge value={k.status} /></Td>
                    <td className="adm-td adm-td--right">
                      <Can permission="smois.kpi.manage">
                        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={async () => { await sendJson('DELETE', `/smois/kpis/${k.id}`); state.reload(); }}>Remove</button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            )
          }
        </Async>
        <p className="adm-filter-note">Follower growth is shared by the whole team and cannot be set as a personal target. A personal target counts only what that person recorded.</p>
        {creating && <NewKpi onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function NewKpi({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const accounts = useAccounts();
  const team = useTeam();
  const [f, setF] = useState({ name: '', metric: 'FOLLOWER_GROWTH', targetValue: '', periodStart: daysAgoIso(0).slice(0, 8) + '01', periodEnd: todayIso(), accountId: '', assigneeId: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <FormModal title="New target" onClose={onClose} submitLabel="Set target" disabled={f.name.trim().length < 2 || !(Number(f.targetValue) > 0)}
      onSubmit={async () => {
        await sendJson('POST', '/smois/kpis', { ...f, targetValue: Number(f.targetValue), accountId: f.accountId || null, assigneeId: f.assigneeId || null });
        onDone();
      }}>
      <TextField label="Name" value={f.name} onChange={set('name')} required placeholder="e.g. November follower growth" />
      <SelectField label="Measure" value={f.metric} onChange={set('metric')} options={Object.entries(METRICS).map(([value, label]) => ({ value, label }))} />
      <TextField label="Goal" type="number" value={f.targetValue} onChange={set('targetValue')} required />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <TextField label="From" type="date" value={f.periodStart} onChange={set('periodStart')} required />
        <TextField label="To" type="date" value={f.periodEnd} onChange={set('periodEnd')} required />
      </div>
      <SelectField label="Account" value={f.accountId} onChange={set('accountId')} options={[{ value: '', label: 'All accounts' }, ...(accounts.data?.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
      <SelectField label="Owner" value={f.assigneeId} onChange={set('assigneeId')} options={[{ value: '', label: 'Whole team' }, ...(team.data?.data ?? []).map((m) => ({ value: m.id, label: m.name }))]}
        help="Pick a person only for work they do themselves, such as posts published or task completion." />
    </FormModal>
  );
}
