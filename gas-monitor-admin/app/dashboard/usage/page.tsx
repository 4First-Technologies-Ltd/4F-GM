'use client';

import { useCallback, useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getJson } from '@/admin/data/source';
import { formatNumber, humaniseEnum } from '@/admin/primitives/format';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { EmptyState, ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { usePermission } from '@/admin/permissions/use-permission';
import type { UsageOverview } from '@/admin/modules/types';

/**
 * App usage — who opens the app and what they do, from events the mobile app
 * sends (`screen_viewed`, `app_opened`). "People" are de-duplicated: a device
 * that browsed logged-out and later signed in counts once.
 */

const RANGES = [7, 30, 90] as const;

function Rank({ title, rows, empty }: { title: string; rows: { label: string; value: number; sub?: string }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="adm-card adm-card-pad">
      <h2 className="adm-section-title">{title}</h2>
      {rows.length === 0 ? (
        <p className="adm-muted">{empty}</p>
      ) : (
        <ul className="adm-doc-list">
          {rows.map((r) => (
            <li key={r.label} className="adm-doc-item" style={{ display: 'grid', gap: 4 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <span style={{ overflowWrap: 'anywhere' }}>{r.label}</span>
                <strong className="adm-num">
                  {formatNumber(r.value)}
                  {r.sub && <span className="adm-muted"> · {r.sub}</span>}
                </strong>
              </span>
              <progress value={r.value} max={max} aria-label={`${r.label}: ${r.value}`} style={{ width: '100%', height: 6 }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function UsagePage() {
  const canRead = usePermission('usage.read');
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<UsageOverview | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const load = useCallback(() => {
    if (!canRead) return;
    setData(null);
    setError(null);
    getJson<UsageOverview>(`/usage/overview?days=${days}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [canRead, days]);
  useEffect(load, [load]);

  if (!canRead) return <ForbiddenState permission="usage.read" />;

  const latestActive = data?.daily.at(-1)?.active ?? 0;
  const empty = data && data.totals.events === 0;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">App usage</h1>
          <p className="adm-page-meta">Activity from the mobile app. Days are Nigerian calendar days.</p>
        </div>
        <div className="adm-page-actions">
          <div className="adm-segmented" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r} type="button" className="adm-segment" aria-pressed={days === r} onClick={() => setDays(r)}>
                {r} days
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <ErrorState title="Could not load usage" error={error} onRetry={load} />
      ) : !data ? (
        <LoadingBlock height={320} />
      ) : empty ? (
        <EmptyState
          title="No usage recorded yet"
          description="Events start arriving once a build of the mobile app that includes usage tracking is in people's hands. Older installed versions send nothing."
        />
      ) : (
        <>
          <StatGrid>
            <StatCard label="People" value={formatNumber(data.totals.people)} caption={`${formatNumber(data.totals.users)} signed in · ${formatNumber(data.totals.devices)} devices`} />
            <StatCard label="Sessions" value={formatNumber(data.totals.sessions)} />
            <StatCard label="Active on latest day" value={formatNumber(latestActive)} caption={data.daily.at(-1)?.day} />
            <StatCard label="Events" value={formatNumber(data.totals.events)} />
          </StatGrid>

          <section className="adm-card adm-card-pad">
            <h2 className="adm-section-title">Daily active people</h2>
            <div className="adm-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.daily} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => formatNumber(v)}
                  />
                  <Line type="monotone" dataKey="active" name="Active people" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="adm-chart-grid">
            <Rank
              title="Most viewed screens"
              empty="No screen views yet."
              rows={data.topScreens.map((s) => ({ label: s.screen, value: s.views, sub: `${formatNumber(s.actors)} people` }))}
            />
            <Rank
              title="Top events"
              empty="No events yet."
              rows={data.topEvents.map((e) => ({ label: humaniseEnum(e.name), value: e.count, sub: `${formatNumber(e.actors)} people` }))}
            />
            <Rank
              title="Who is using it"
              empty="No data."
              rows={data.roles.map((r) => ({ label: r.role === 'ANONYMOUS' ? 'Not signed in' : humaniseEnum(r.role), value: r.actors }))}
            />
            <Rank
              title="App versions"
              empty="No data."
              rows={data.versions.map((v) => ({ label: v.version, value: v.actors }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
