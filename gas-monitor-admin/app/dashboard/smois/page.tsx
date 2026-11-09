'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import Link from 'next/link';
import { Async, ManualNote, PageShell, PeriodBar, daysAgoIso, fmt, fmtSigned, todayIso, useApi } from './_ui';

function Alerts() {
  const alerts = useApi<{ data: { level: string; text: string; href: string }[] }>('/smois/alerts');
  const list = alerts.data?.data ?? [];
  if (list.length === 0) return null;
  return (
    <ul className="adm-card adm-card-pad" style={{ listStyle: 'none', margin: '0 0 var(--space-4)', display: 'grid', gap: 'var(--space-2)' }} aria-label="Alerts">
      {list.map((a, i) => (
        <li key={i}><Link className="adm-link" href={a.href} style={a.level === 'error' ? { color: 'var(--error)' } : undefined}>{a.level === 'error' ? '! ' : ''}{a.text}</Link></li>
      ))}
    </ul>
  );
}

interface Overview {
  period: { from: string; to: string };
  accounts: { total: number; connectedByApi: number };
  content: {
    awaitingApproval: number; approved: number; scheduled: number;
    revisionRequested: number; rejected: number; publishedInPeriod: number;
  };
  tasks: { pending: number; completed: number; overdue: number };
  reportsToReview: number | null;
  activeManagers: number | null;
  growth: { net: number | null; accountsWithData: number; accounts: number } | null;
  scope: 'department' | 'mine';
}

export default function SocialOverviewPage() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const state = useApi<Overview>(`/smois/overview?from=${from}&to=${to}`);

  return (
    <RequirePermission permission="smois.read">
      <PageShell
        title="Social media operations"
        meta="What the social media team is doing, what is waiting on someone, and how the accounts are growing."
      >
        <Alerts />
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Async state={state} columns={4}>
          {(o) => (
            <>
              <h2 className="adm-section-title">Needs attention</h2>
              <StatGrid>
                <StatCard label="Awaiting approval" value={fmt(o.content.awaitingApproval)} caption="Content submitted for review" actionable={o.content.awaitingApproval > 0} href="/dashboard/smois/content?status=SUBMITTED" />
                <StatCard label="Overdue tasks" value={fmt(o.tasks.overdue)} caption={o.scope === 'mine' ? 'Assigned to you' : 'Across the team'} actionable={o.tasks.overdue > 0} href="/dashboard/smois/tasks?due=overdue" />
                <StatCard label="Revisions requested" value={fmt(o.content.revisionRequested)} caption="Sent back to the author" href="/dashboard/smois/content?status=REVISION_REQUESTED" />
                {o.reportsToReview != null && (
                  <StatCard label="Reports to review" value={fmt(o.reportsToReview)} caption="Weekly and monthly" actionable={o.reportsToReview > 0} href="/dashboard/smois/reports" />
                )}
              </StatGrid>

              <h2 className="adm-section-title" style={{ marginTop: 'var(--space-6)' }}>Output</h2>
              <StatGrid>
                <StatCard label="Posts published" value={fmt(o.content.publishedInPeriod)} caption={`${o.period.from} to ${o.period.to} · recorded by the team`} href="/dashboard/smois/publishing" />
                <StatCard label="Scheduled" value={fmt(o.content.scheduled)} caption="Approved and dated" href="/dashboard/smois/calendar" />
                <StatCard label="Approved, not yet posted" value={fmt(o.content.approved)} caption="Ready to publish" href="/dashboard/smois/content?status=APPROVED" />
                <StatCard label="Tasks open" value={fmt(o.tasks.pending)} caption={`${fmt(o.tasks.completed)} completed in total`} href="/dashboard/smois/tasks" />
              </StatGrid>

              <h2 className="adm-section-title" style={{ marginTop: 'var(--space-6)' }}>Audience</h2>
              <StatGrid>
                <StatCard label="Social accounts" value={fmt(o.accounts.total)} caption={o.accounts.connectedByApi ? `${o.accounts.connectedByApi} connected by API` : 'None connected by API · figures are entered by hand'} href="/dashboard/smois/accounts" />
                {o.growth && (
                  <StatCard
                    label="Net follower growth"
                    value={fmtSigned(o.growth.net)}
                    caption={
                      o.growth.net == null
                        ? 'Needs two follower readings in this period'
                        : `${o.growth.accountsWithData} of ${o.growth.accounts} accounts have data · entered by hand`
                    }
                    href="/dashboard/smois/analytics"
                  />
                )}
                {o.activeManagers != null && <StatCard label="Active managers" value={fmt(o.activeManagers)} href="/dashboard/smois/performance" />}
              </StatGrid>
              <ManualNote />
            </>
          )}
        </Async>
      </PageShell>
    </RequirePermission>
  );
}
