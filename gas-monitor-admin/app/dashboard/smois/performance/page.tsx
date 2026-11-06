'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { usePermission } from '@/admin/permissions/use-permission';
import { EmptyState } from '@/admin/primitives/states';
import { Async, PageShell, PeriodBar, SimpleTable, Td, daysAgoIso, downloadCsv, fmt, fmtPct, todayIso, useApi } from '../_ui';

interface Person {
  adminId: string; name: string;
  tasks: { assigned: number; completed: number; overdueNow: number; completionRate: number | null; onTimeRate: number | null };
  content: { created: number; submitted: number; approvedReviews: number; rejectedReviews: number; revisionsRequested: number; published: number };
  reportsSubmitted: number;
  scorecard: { categories: { key: string; label: string; weight: number; value: number | null }[]; overall: number | null; measuredWeight: number };
}

export default function PerformancePage() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const state = useApi<{ period: { from: string; to: string }; note: string; data: Person[] }>(`/smois/performance?from=${from}&to=${to}`);
  const canExport = usePermission('smois.export') || usePermission('smois.performance.read');

  return (
    <RequirePermission permission="smois.performance.own">
      <PageShell
        title="Staff performance"
        meta="Measured work, from system records. Managers see their own; management sees the team."
        actions={canExport && state.data ? (
          <button type="button" className="adm-btn" onClick={() => downloadCsv(`staff-performance_${from}_${to}.csv`, [
            ['Name', 'Tasks assigned (due in period)', 'Tasks completed', 'Completion %', 'On-time %', 'Overdue now', 'Content created', 'Content published', 'Approved reviews', 'Rejected reviews', 'Revisions requested', 'Reports submitted', 'Score', 'Weight measured %'],
            ...state.data!.data.map((p) => [p.name, p.tasks.assigned, p.tasks.completed, p.tasks.completionRate, p.tasks.onTimeRate, p.tasks.overdueNow, p.content.created, p.content.published, p.content.approvedReviews, p.content.rejectedReviews, p.content.revisionsRequested, p.reportsSubmitted, p.scorecard.overall, p.scorecard.measuredWeight])
          ])}>Export CSV</button>
        ) : undefined}
      >
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Async state={state} columns={6}>
          {(r) =>
            r.data.length === 0 ? (
              <EmptyState title="No managers yet" description="Give an admin the social media manager role under Admin users." />
            ) : (
              <>
                <SimpleTable head={['Team member', 'Tasks', 'On time', 'Content', 'Reports', 'Score']}>
                  {r.data.map((p) => (
                    <tr key={p.adminId} className="adm-tr">
                      <Td sub={p.tasks.overdueNow ? `${p.tasks.overdueNow} overdue now` : undefined}>{p.name}</Td>
                      <Td sub={`${fmtPct(p.tasks.completionRate)} completed`}>{p.tasks.completed} of {p.tasks.assigned}</Td>
                      <Td>{fmtPct(p.tasks.onTimeRate)}</Td>
                      <Td sub={`${p.content.published} published · ${p.content.revisionsRequested} revisions asked`}>{p.content.created} created</Td>
                      <Td>{p.reportsSubmitted}</Td>
                      <Td sub={p.scorecard.overall == null ? 'Nothing measured yet' : `${p.scorecard.measuredWeight}% of the scorecard measured`}>
                        {p.scorecard.overall == null ? '—' : fmt(p.scorecard.overall)}
                      </Td>
                    </tr>
                  ))}
                </SimpleTable>
                {r.data.map((p) => (
                  <details key={p.adminId} className="adm-card adm-card-pad" style={{ marginTop: 'var(--space-3)' }}>
                    <summary>Scorecard: {p.name}</summary>
                    <SimpleTable head={['Category', 'Weight', 'Result']}>
                      {p.scorecard.categories.map((c) => (
                        <tr key={c.key} className="adm-tr">
                          <Td>{c.label}</Td>
                          <Td>{c.weight}%</Td>
                          <Td>{c.value == null ? <span className="adm-muted">{c.key === 'community' ? 'Not measured until the inbox is built' : 'Nothing to measure in this period'}</span> : fmtPct(c.value)}</Td>
                        </tr>
                      ))}
                    </SimpleTable>
                  </details>
                ))}
                <p className="adm-filter-note">{r.note} The score is an average of the measured categories weighted by the starting model (tasks 20, consistency 20, quality 15, community 15, reporting 10, objectives 20). It supports a conversation; it is not a verdict.</p>
              </>
            )
          }
        </Async>
      </PageShell>
    </RequirePermission>
  );
}
