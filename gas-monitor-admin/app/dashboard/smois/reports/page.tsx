'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import { Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { useAdminSession } from '@/lib/admin-session-context';
import { sendJson } from '@/lib/post';
import { Async, FormModal, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, downloadCsv, fmt, fmtPct, fmtSigned, isoDay, useApi } from '../_ui';

interface Report {
  id: string; type: 'WEEKLY' | 'MONTHLY'; periodStart: string; periodEnd: string; authorId: string; authorName: string; status: string;
  narrative: { summary?: string; challenges?: string; nextPeriod?: string; recommendations?: string } | null;
  reviewerName: string | null; reviewNote: string | null; submittedAt: string | null;
}
interface Figures {
  tasks: { assigned: number; completed: number; overdueNow: number; completionRate: number | null; onTimeRate: number | null };
  content: { created: number; submitted: number; approvedReviews: number; rejectedReviews: number; revisionsRequested: number; published: number };
  accounts: { account: { name: string; platform: string } | null; opening: number | null; closing: number | null; net: number | null; growthPct: number | null; reach: number | null; engagement: number | null; daysRecorded: number; daysInPeriod: number }[];
}

/** The most recent Monday on or before today, and the first of this month, as defaults. */
function lastMonday() {
  const d = new Date();
  const back = (d.getUTCDay() + 6) % 7;
  return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)));
}
const firstOfMonth = () => { const d = new Date(); return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))); };

export default function ReportsPage() {
  const state = useApi<{ data: Report[] }>('/smois/reports');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <RequirePermission permission="smois.reports.write">
      <PageShell
        title="Weekly and monthly reports"
        meta="Figures fill in from system records. You add the explanation and recommendations, then submit."
        actions={<Can permission="smois.reports.write"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>Start a report</button></Can>}
      >
        <Async state={state} columns={5}>
          {({ data }) =>
            data.length === 0 ? (
              <EmptyState title="No reports yet" description="Start this week's or this month's report. The numbers are filled in for you." />
            ) : (
              <SimpleTable head={['Period', 'Type', 'Author', 'Status', 'Submitted']}>
                {data.map((r) => (
                  <tr key={r.id} className="adm-tr" onClick={() => setOpenId(r.id)} style={{ cursor: 'pointer' }}>
                    <Td><button type="button" className="adm-link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setOpenId(r.id)}>{r.periodStart} to {r.periodEnd}</button></Td>
                    <Td>{r.type === 'WEEKLY' ? 'Weekly' : 'Monthly'}</Td>
                    <Td>{r.authorName}</Td>
                    <Td sub={r.reviewNote ?? undefined}><StatusBadge value={r.status} /></Td>
                    <Td>{r.submittedAt ? formatDateTime(r.submittedAt) : <span className="adm-muted">Not submitted</span>}</Td>
                  </tr>
                ))}
              </SimpleTable>
            )
          }
        </Async>
        {creating && <NewReport onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); state.reload(); setOpenId(id); }} />}
        {openId && <ReportDetail id={openId} onClose={() => setOpenId(null)} onChanged={state.reload} />}
      </PageShell>
    </RequirePermission>
  );
}

function NewReport({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [type, setType] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [start, setStart] = useState(lastMonday());
  return (
    <FormModal title="Start a report" onClose={onClose} submitLabel="Start"
      onSubmit={async () => { const r = await sendJson<{ report: { id: string } }>('POST', '/smois/reports', { type, periodStart: start }); onDone(r.report.id); }}>
      <SelectField label="Type" value={type} onChange={(v) => { setType(v as 'WEEKLY' | 'MONTHLY'); setStart(v === 'WEEKLY' ? lastMonday() : firstOfMonth()); }}
        options={[{ value: 'WEEKLY', label: 'Weekly (Monday to Sunday)' }, { value: 'MONTHLY', label: 'Monthly (calendar month)' }]} />
      <TextField label={type === 'WEEKLY' ? 'Week starting (a Monday)' : 'Month starting (the 1st)'} type="date" value={start} onChange={setStart} required />
    </FormModal>
  );
}

function ReportDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const state = useApi<{ report: Report; figures: Figures; figuresFrozen: boolean }>(`/smois/reports/${id}`);
  const { adminId } = useAdminSession();
  const canReview = usePermission('smois.reports.review');
  const canExport = usePermission('smois.export') || usePermission('smois.reports.write');
  const [text, setText] = useState<Report['narrative'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const refresh = () => { state.reload(); onChanged(); };
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Modal wide title="Report" onClose={onClose} footer={<button type="button" className="adm-btn" onClick={onClose}>Close</button>}>
      <Async state={state} columns={2}>
        {({ report: r, figures: f, figuresFrozen }) => {
          const mine = r.authorId === adminId;
          const editable = mine && (r.status === 'DRAFT' || r.status === 'RETURNED');
          const n = text ?? r.narrative ?? {};
          const field = (k: 'summary' | 'challenges' | 'nextPeriod' | 'recommendations', label: string, help?: string) => (
            <TextArea label={label} value={n[k] ?? ''} rows={3} help={help}
              onChange={(v) => editable && setText({ ...n, [k]: v })} />
          );
          return (
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <div>
                <h3 style={{ margin: 0 }}>{r.type === 'WEEKLY' ? 'Weekly' : 'Monthly'} report · {r.periodStart} to {r.periodEnd}</h3>
                <p className="adm-muted">{r.authorName} · <StatusBadge value={r.status} />{r.reviewerName ? ` · reviewed by ${r.reviewerName}` : ''}</p>
                {r.reviewNote && <p>Reviewer note: {r.reviewNote}</p>}
              </div>
              {error && <div className="adm-inline-error" role="alert"><span>{error}</span></div>}

              <h4 className="adm-micro-label">Figures {figuresFrozen ? '(frozen when submitted)' : '(live, will be frozen on submit)'}</h4>
              <SimpleTable head={['Measure', 'Value']}>
                <tr className="adm-tr"><Td>Tasks completed / due in period</Td><Td>{f.tasks.completed} of {f.tasks.assigned} ({fmtPct(f.tasks.completionRate)})</Td></tr>
                <tr className="adm-tr"><Td>Tasks on time</Td><Td>{fmtPct(f.tasks.onTimeRate)}</Td></tr>
                <tr className="adm-tr"><Td>Content created / published</Td><Td>{f.content.created} / {f.content.published}</Td></tr>
                <tr className="adm-tr"><Td>Reviews: approved / revisions asked / rejected</Td><Td>{f.content.approvedReviews} / {f.content.revisionsRequested} / {f.content.rejectedReviews}</Td></tr>
              </SimpleTable>
              <SimpleTable head={['Account', 'Opening', 'Closing', 'Net', 'Growth', 'Reach', 'Engagement', 'Data']} empty={f.accounts.length === 0 ? 'No assigned accounts had readings.' : undefined}>
                {f.accounts.map((a, i) => (
                  <tr key={i} className="adm-tr">
                    <Td>{a.account?.name}</Td><Td>{fmt(a.opening)}</Td><Td>{fmt(a.closing)}</Td><Td>{fmtSigned(a.net)}</Td>
                    <Td>{a.growthPct == null ? '—' : fmtPct(a.growthPct)}</Td><Td>{fmt(a.reach)}</Td><Td>{fmt(a.engagement)}</Td>
                    <Td>{a.daysRecorded}/{a.daysInPeriod} days</Td>
                  </tr>
                ))}
              </SimpleTable>

              {field('summary', 'Summary and work completed', 'Required to submit.')}
              {editable && (
                <button type="button" className="adm-btn adm-btn--sm" style={{ justifySelf: 'start' }}
                  onClick={() => act(async () => { const d = await sendJson<{ text: string }>('POST', '/smois/ai/report-draft', { reportId: r.id }); setText({ ...n, summary: d.text }); })}>
                  Draft the summary with AI
                </button>
              )}
              {field('challenges', 'Challenges and delays')}
              {field('nextPeriod', r.type === 'WEEKLY' ? 'Planned for next week' : 'Priorities for next month')}
              {field('recommendations', 'Recommendations')}

              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {editable && (
                  <>
                    <button type="button" className="adm-btn" onClick={() => act(() => sendJson('PATCH', `/smois/reports/${r.id}`, n))}>Save draft</button>
                    <button type="button" className="adm-btn adm-btn--primary" onClick={() => act(async () => { await sendJson('PATCH', `/smois/reports/${r.id}`, n); await sendJson('POST', `/smois/reports/${r.id}/submit`); })}>Submit report</button>
                  </>
                )}
                {canReview && !mine && r.status === 'SUBMITTED' && <button type="button" className="adm-btn adm-btn--primary" onClick={() => setReviewing(true)}>Review</button>}
                {canExport && (
                  <button type="button" className="adm-btn" onClick={() => downloadCsv(`report_${r.type.toLowerCase()}_${r.periodStart}_${r.authorName.replace(/\W+/g, '-')}.csv`, [
                    ['Report', r.type, r.periodStart, r.periodEnd, r.authorName, r.status],
                    ['Account', 'Opening', 'Closing', 'Net', 'Growth %', 'Reach', 'Engagement', 'Days recorded', 'Days in period'],
                    ...f.accounts.map((a) => [a.account?.name, a.opening, a.closing, a.net, a.growthPct, a.reach, a.engagement, a.daysRecorded, a.daysInPeriod]),
                    ['Tasks completed', f.tasks.completed, 'of', f.tasks.assigned],
                    ['Content created', f.content.created, 'published', f.content.published],
                    ['Summary', n.summary], ['Challenges', n.challenges], ['Next', n.nextPeriod], ['Recommendations', n.recommendations]
                  ])}>Export CSV</button>
                )}
              </div>
              {reviewing && <ReviewReport report={r} onClose={() => setReviewing(false)} onDone={() => { setReviewing(false); refresh(); }} />}
            </div>
          );
        }}
      </Async>
    </Modal>
  );
}

function ReviewReport({ report, onClose, onDone }: { report: Report; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState('APPROVED');
  const [note, setNote] = useState('');
  return (
    <FormModal title="Review report" onClose={onClose} submitLabel="Submit decision" disabled={decision === 'RETURNED' && note.trim().length < 3}
      onSubmit={async () => { await sendJson('POST', `/smois/reports/${report.id}/review`, { decision, note: note || undefined }); onDone(); }}>
      <SelectField label="Decision" value={decision} onChange={setDecision} options={[{ value: 'APPROVED', label: 'Approve' }, { value: 'RETURNED', label: 'Return for clarification' }]} />
      <TextArea label="Note" value={note} onChange={setNote} rows={3} help={decision === 'RETURNED' ? 'Required: say what to clarify.' : 'Optional'} />
    </FormModal>
  );
}
