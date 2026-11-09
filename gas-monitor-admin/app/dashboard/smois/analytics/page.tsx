'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, ManualNote, NumField, PLATFORM_LABEL, PageShell, PeriodBar, SelectField, SimpleTable, TextField, Td,
  daysAgoIso, downloadCsv, fmt, fmtPct, fmtSigned, isoDay, todayIso, toInt, useAccounts, useApi
} from '../_ui';
import { usePermission } from '@/admin/permissions/use-permission';

interface Summary {
  opening: number | null; closing: number | null; net: number | null; growthPct: number | null;
  reach: number | null; impressions: number | null; engagement: number | null; profileVisits: number | null;
  videoViews: number | null; websiteClicks: number | null; engagementRateByReach: number | null;
  daysRecorded: number; daysInPeriod: number;
}
interface Analytics {
  period: { from: string; to: string; days: number };
  previousPeriod: { from: string; to: string };
  rows: { account: { id: string; name: string; platform: string; handle: string }; current: Summary; previous: Summary; postsPublished: number; sources: string[] }[];
}
interface Series { data: { date: string; followers: number | null; reach: number | null; source: string }[] }

export default function AnalyticsPage() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [recording, setRecording] = useState(false);
  const [chartFor, setChartFor] = useState<string | null>(null);
  const state = useApi<Analytics>(`/smois/analytics?from=${from}&to=${to}`);
  const canExport = usePermission('smois.export');

  const exportCsv = (a: Analytics) =>
    downloadCsv(`social-growth_${a.period.from}_${a.period.to}.csv`, [
      ['Account', 'Platform', 'Handle', 'Period from', 'Period to', 'Opening followers', 'Closing followers', 'Net growth', 'Growth %', 'Reach', 'Impressions', 'Engagement', 'Engagement rate by reach %', 'Profile visits', 'Video views', 'Website clicks', 'Posts published', 'Days recorded', 'Days in period', 'Previous period net growth', 'Source'],
      ...a.rows.map((r) => [r.account.name, PLATFORM_LABEL[r.account.platform], r.account.handle, a.period.from, a.period.to, r.current.opening, r.current.closing, r.current.net, r.current.growthPct, r.current.reach, r.current.impressions, r.current.engagement, r.current.engagementRateByReach, r.current.profileVisits, r.current.videoViews, r.current.websiteClicks, r.postsPublished, r.current.daysRecorded, r.current.daysInPeriod, r.previous.net, r.sources.join('/') || 'none'])
    ]);

  return (
    <RequirePermission permission="smois.analytics.read">
      <PageShell
        title="Growth analytics"
        meta="Followers, reach and engagement per account, compared with the period just before. Blank means not recorded, never zero."
        actions={
          <>
            {canExport && state.data && <button type="button" className="adm-btn" onClick={() => exportCsv(state.data!)}>Export CSV</button>}
            <Can permission="smois.metrics.record"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setRecording(true)}>Record figures</button></Can>
          </>
        }
      >
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <Async state={state} columns={7}>
          {(a) =>
            a.rows.length === 0 ? (
              <EmptyState title="No accounts to show" description="You see the accounts you are assigned to. Management sees all." />
            ) : (
              <>
                <SimpleTable head={['Account', 'Followers', 'Net growth', 'vs previous period', 'Reach', 'Engagement', 'Posts', 'Data']}>
                  {a.rows.map((r) => (
                    <tr key={r.account.id} className="adm-tr">
                      <Td sub={`${PLATFORM_LABEL[r.account.platform]} · ${r.account.handle}`}>
                        <button type="button" className="adm-link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setChartFor(chartFor === r.account.id ? null : r.account.id)}>{r.account.name}</button>
                      </Td>
                      <Td sub={r.current.opening != null ? `from ${fmt(r.current.opening)}` : undefined}>{fmt(r.current.closing)}</Td>
                      <Td sub={r.current.growthPct != null ? fmtPct(r.current.growthPct) : r.current.net == null ? 'Needs two readings' : undefined}>{fmtSigned(r.current.net)}</Td>
                      <Td>{r.current.net != null && r.previous.net != null ? fmtSigned(r.current.net - r.previous.net) : <span className="adm-muted">Not comparable</span>}</Td>
                      <Td>{fmt(r.current.reach)}</Td>
                      <Td sub={r.current.engagementRateByReach != null ? `${fmtPct(r.current.engagementRateByReach)} of reach` : undefined}>{fmt(r.current.engagement)}</Td>
                      <Td>{r.postsPublished}</Td>
                      <Td sub={r.sources.join(', ').toLowerCase() || undefined}>
                        {r.current.daysRecorded} of {r.current.daysInPeriod} days
                        {r.current.daysRecorded < r.current.daysInPeriod && <> <StatusBadge value="PENDING" /></>}
                      </Td>
                    </tr>
                  ))}
                </SimpleTable>
                {chartFor && <Chart accountId={chartFor} from={from} to={to} />}
                <p className="adm-filter-note">Net growth = closing followers minus opening followers, using the first and last readings in the period. Engagement rate by reach = engagement ÷ reach × 100. Compared with {a.previousPeriod.from} to {a.previousPeriod.to}.</p>
              </>
            )
          }
        </Async>
        <ManualNote />
        {recording && <RecordForm onClose={() => setRecording(false)} onDone={() => { setRecording(false); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function Chart({ accountId, from, to }: { accountId: string; from: string; to: string }) {
  const state = useApi<Series>(`/smois/analytics/series?accountId=${accountId}&from=${from}&to=${to}`);
  return (
    <div className="adm-card adm-card-pad" style={{ marginTop: 'var(--space-4)' }}>
      <h2 className="adm-section-title">Followers over time</h2>
      <Async state={state} columns={1}>
        {({ data }) => {
          const pts = data.filter((d) => d.followers != null) as { date: string; followers: number }[];
          if (pts.length < 2) return <p className="adm-muted">Record follower counts on at least two days to draw the trend.</p>;
          const W = 640, H = 160, P = 28;
          const min = Math.min(...pts.map((p) => p.followers)), max = Math.max(...pts.map((p) => p.followers));
          const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts[pts.length - 1].date).getTime();
          const x = (d: string) => P + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
          const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
          return (
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Followers from ${fmt(pts[0].followers)} to ${fmt(pts[pts.length - 1].followers)}`} style={{ width: '100%', maxWidth: W }}>
              <polyline fill="none" stroke="var(--accent, #2D7450)" strokeWidth="2" points={pts.map((p) => `${x(p.date)},${y(p.followers)}`).join(' ')} />
              {pts.map((p) => <circle key={p.date} cx={x(p.date)} cy={y(p.followers)} r="3" fill="var(--accent, #2D7450)"><title>{`${p.date}: ${fmt(p.followers)}`}</title></circle>)}
              <text x={P} y={H - 6} fontSize="10" fill="currentColor">{pts[0].date}</text>
              <text x={W - P} y={H - 6} fontSize="10" fill="currentColor" textAnchor="end">{pts[pts.length - 1].date}</text>
              <text x={4} y={y(max) + 4} fontSize="10" fill="currentColor">{fmt(max)}</text>
              <text x={4} y={y(min) + 4} fontSize="10" fill="currentColor">{fmt(min)}</text>
            </svg>
          );
        }}
      </Async>
    </div>
  );
}

function RecordForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const accounts = useAccounts();
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(isoDay(new Date()));
  const [v, setV] = useState({ followers: '', reach: '', impressions: '', engagement: '', profileVisits: '', videoViews: '', websiteClicks: '' });
  const [estimated, setEstimated] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  return (
    <FormModal title="Record daily figures" onClose={onClose} submitLabel="Save" disabled={!accountId || Object.values(v).every((x) => x === '')}
      onSubmit={async () => {
        await sendJson('POST', '/smois/snapshots', { accountId, date, source: estimated ? 'ESTIMATED' : 'MANUAL', ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toInt(x)])) });
        onDone();
      }}>
      <SelectField label="Account" value={accountId} onChange={setAccountId} required
        options={[{ value: '', label: accounts.loading ? 'Loading…' : 'Choose…' }, ...(accounts.data?.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${PLATFORM_LABEL[a.platform]})` }))]} />
      <TextField label="Date of the reading" type="date" value={date} onChange={setDate} max={todayIso()} required />
      <p className="adm-muted">One reading per account per day. Leave a box empty if you do not have that figure. Take it from the platform&apos;s own insights page.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <NumField label="Total followers" value={v.followers} onChange={set('followers')} />
        <NumField label="Reach" value={v.reach} onChange={set('reach')} />
        <NumField label="Impressions" value={v.impressions} onChange={set('impressions')} />
        <NumField label="Engagement actions" value={v.engagement} onChange={set('engagement')} />
        <NumField label="Profile visits" value={v.profileVisits} onChange={set('profileVisits')} />
        <NumField label="Video views" value={v.videoViews} onChange={set('videoViews')} />
        <NumField label="Website clicks" value={v.websiteClicks} onChange={set('websiteClicks')} />
      </div>
      <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" className="adm-checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} /> These are estimates
      </label>
    </FormModal>
  );
}
