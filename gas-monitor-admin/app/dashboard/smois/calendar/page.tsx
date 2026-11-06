'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { Async, PLATFORM_LABEL, PageShell, Toolbar, isoDay, useAccounts, useApi } from '../_ui';

interface Item {
  id: string; title: string; status: string; plannedAt: string; format: string; creatorName: string; accountId: string;
  account: { name: string; platform: string }; warnings: string[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
  const [accountId, setAccountId] = useState('');
  const accounts = useAccounts();

  // Monday-first grid covering the whole month.
  const { gridStart, gridEnd } = useMemo(() => {
    const first = new Date(Date.UTC(cursor.y, cursor.m, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first.getTime() - offset * 86400000);
    const last = new Date(Date.UTC(cursor.y, cursor.m + 1, 0));
    const end = new Date(last.getTime() + ((7 - ((last.getUTCDay() + 6) % 7) - 1) % 7) * 86400000);
    return { gridStart: start, gridEnd: end };
  }, [cursor]);

  const state = useApi<{ data: Item[] }>(`/smois/calendar?from=${isoDay(gridStart)}&to=${isoDay(gridEnd)}${accountId ? `&accountId=${accountId}` : ''}`);
  const days: Date[] = [];
  for (let d = gridStart.getTime(); d <= gridEnd.getTime(); d += 86400000) days.push(new Date(d));
  const label = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString('en-NG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const step = (n: number) => setCursor((c) => { const d = new Date(Date.UTC(c.y, c.m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });

  return (
    <RequirePermission permission="smois.read">
      <PageShell title="Content calendar" meta="Everything planned, scheduled and published, for every account. Warnings flag clashes and missed dates.">
        <Toolbar>
          <button type="button" className="adm-btn" onClick={() => step(-1)} aria-label="Previous month">‹</button>
          <strong style={{ minWidth: 150, textAlign: 'center', paddingBottom: 8 }}>{label}</strong>
          <button type="button" className="adm-btn" onClick={() => step(1)} aria-label="Next month">›</button>
          <label className="adm-field">
            <span className="adm-field-label">Account</span>
            <select className="adm-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">All accounts</option>
              {(accounts.data?.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name} ({PLATFORM_LABEL[a.platform]})</option>)}
            </select>
          </label>
        </Toolbar>

        <Async state={state} columns={7}>
          {({ data }) => (
            <div className="adm-table-scroll">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))', gap: 1, background: 'var(--border, #ccd)', minWidth: 840 }}>
                {WEEKDAYS.map((w) => <div key={w} className="adm-micro-label" style={{ background: 'var(--surface, #fff)', padding: 'var(--space-2)' }}>{w}</div>)}
                {days.map((d) => {
                  const key = isoDay(d);
                  const items = data.filter((i) => i.plannedAt.slice(0, 10) === key);
                  const inMonth = d.getUTCMonth() === cursor.m;
                  return (
                    <div key={key} style={{ background: 'var(--surface, #fff)', minHeight: 96, padding: 'var(--space-2)', opacity: inMonth ? 1 : 0.5 }}>
                      <div className="adm-muted" style={{ fontSize: 12 }}>{d.getUTCDate()}</div>
                      {items.map((i) => (
                        <Link key={i.id} href={`/dashboard/smois/content`} className="adm-link" style={{ display: 'block', fontSize: 12, marginTop: 4 }} title={i.warnings.join('. ') || i.title}>
                          {i.warnings.length > 0 && <span aria-label="Warning">⚠ </span>}
                          {i.title}
                          <span className="adm-td-sub">{i.account.name} · <StatusBadge value={i.status} /></span>
                        </Link>
                      ))}
                    </div>
                  );
                })}
              </div>
              {data.some((i) => i.warnings.length) && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <h2 className="adm-section-title">Warnings</h2>
                  <ul>
                    {data.filter((i) => i.warnings.length).map((i) => (
                      <li key={i.id}>{i.title} ({i.account.name}): {i.warnings.join('; ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.length === 0 && <p className="adm-muted" style={{ marginTop: 'var(--space-4)' }}>Nothing is planned in this view. Set a planned date on content to see it here.</p>}
            </div>
          )}
        </Async>
      </PageShell>
    </RequirePermission>
  );
}
