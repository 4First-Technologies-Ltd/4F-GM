'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatNaira, formatNumber } from '@/admin/primitives/format';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import type { Briefing, BriefingDay } from '@/admin/modules/types';

/**
 * Ops briefing — one page that answers "what needs me today?". Generated every
 * morning (07:00 Lagos) for the previous day and posted to Telegram; flags are
 * fixed rules, each with the action to take and a link to do it.
 */

const SEVERITY_TONE = { critical: 'error', warning: 'warning', info: 'info' } as const;
const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', info: 'FYI' } as const;

const vs = (avg: number) => (avg > 0 ? `${avg}/day over the previous week` : 'no previous-week baseline');

export default function BriefingPage() {
  const canRead = usePermission('briefing.read');
  const [days, setDays] = useState<BriefingDay[] | null>(null);
  const [yesterday, setYesterday] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadList = useCallback(() => {
    if (!canRead) return;
    getJson<{ days: BriefingDay[]; yesterday: string }>('/briefing')
      .then((r) => {
        setDays(r.days);
        setYesterday(r.yesterday);
        setSelected((cur) => cur ?? r.days[0]?.day ?? r.yesterday);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [canRead]);
  useEffect(loadList, [loadList]);

  const loadDay = useCallback(() => {
    if (!selected) return;
    setBriefing(null);
    setMissing(false);
    getJson<{ briefing: Briefing }>(`/briefing/${selected}`)
      .then((r) => setBriefing(r.briefing))
      .catch((e) => {
        if (/no briefing/i.test(String(e?.message))) setMissing(true);
        else setError(e instanceof Error ? e : new Error(String(e)));
      });
  }, [selected]);
  useEffect(loadDay, [loadDay]);

  async function generate() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await sendJson('POST', `/briefing/${selected}/generate`);
      loadList();
      loadDay();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) return <ForbiddenState permission="briefing.read" />;
  if (error) {
    return (
      <div className="adm-page">
        <ErrorState title="Could not load the briefing" error={error} onRetry={() => { setError(null); loadList(); loadDay(); }} />
      </div>
    );
  }

  const m = briefing?.metrics;
  const options = Array.from(new Set([...(days?.map((d) => d.day) ?? []), ...(yesterday ? [yesterday] : [])])).sort().reverse();

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Ops briefing</h1>
          <p className="adm-page-meta">What happened yesterday and what needs attention now. Built each morning at 07:00 Lagos time.</p>
        </div>
        <div className="adm-page-actions">
          <select className="adm-input" aria-label="Briefing day" value={selected ?? ''} onChange={(e) => setSelected(e.target.value)}>
            {options.map((d) => (
              <option key={d} value={d}>
                {d}
                {d === yesterday ? ' (yesterday)' : ''}
              </option>
            ))}
          </select>
          <Can permission="briefing.generate">
            <button type="button" className="adm-btn" disabled={busy || !selected} onClick={generate}>
              {busy ? 'Building…' : briefing ? 'Rebuild' : 'Build now'}
            </button>
          </Can>
        </div>
      </header>

      {actionError && (
        <div className="adm-inline-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      {!days || (!briefing && !missing) ? (
        <LoadingBlock height={320} />
      ) : missing || !briefing || !m ? (
        <EmptyState
          title={`No briefing for ${selected}`}
          description="The scheduled run builds yesterday's briefing after 07:00 Lagos time. You can build any finished day now."
        />
      ) : (
        <>
          <section className="adm-card adm-card-pad" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge value={briefing.status} />
            <span>
              {briefing.flags.length === 0
                ? 'Nothing needs attention.'
                : `${briefing.flags.length} thing${briefing.flags.length === 1 ? '' : 's'} to look at.`}
            </span>
            <span className="adm-muted">
              Built {formatDateTime(briefing.updatedAt)} ·{' '}
              {briefing.sentAt ? `posted to Telegram ${formatDateTime(briefing.sentAt)}` : briefing.sendError ? `Telegram: ${briefing.sendError}` : 'not posted to Telegram'}
            </span>
          </section>

          {briefing.flags.length > 0 && (
            <ul className="adm-card-list">
              {briefing.flags.map((f) => (
                <li key={f.key} className="adm-card adm-card-pad" style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <span style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`adm-badge adm-badge--${SEVERITY_TONE[f.severity]}`}>{SEVERITY_LABEL[f.severity]}</span>
                    <strong>{f.title}</strong>
                  </span>
                  <span className="adm-muted">{f.detail}</span>
                  <span>
                    <strong>Do:</strong> {f.action}{' '}
                    <Link className="adm-link" href={f.href}>
                      Open →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="adm-section-title">Orders on {m.day}</h2>
          <StatGrid>
            <StatCard label="Placed" value={formatNumber(m.orders.placed)} caption={vs(m.orders.sevenDayAvg.placed)} />
            <StatCard label="Delivered" value={formatNumber(m.orders.delivered)} caption={m.orders.avgDeliveryHours != null ? `avg ${m.orders.avgDeliveryHours}h to deliver` : undefined} />
            <StatCard label="Cancelled" value={formatNumber(m.orders.cancelled)} />
            <StatCard label="Delivered value" value={formatNaira(m.orders.gmv)} caption={`${formatNaira(m.orders.sevenDayAvg.gmv)}/day previous week`} />
          </StatGrid>

          <h2 className="adm-section-title">Right now</h2>
          <StatGrid>
            <StatCard label="Awaiting a rider" value={formatNumber(m.live.awaitingRider)} caption={m.live.oldestAwaitingRiderMin != null ? `oldest ${m.live.oldestAwaitingRiderMin} min` : 'over 30 min'} actionable={m.live.awaitingRider > 0} href="/dashboard/orders?status=CONFIRMED" />
            <StatCard label="Out for delivery 4h+" value={formatNumber(m.live.stuckOutForDelivery)} actionable={m.live.stuckOutForDelivery > 0} href="/dashboard/orders?status=OUT_FOR_DELIVERY" />
            <StatCard label="Open tickets" value={formatNumber(m.support.openNow)} caption={`${m.support.overdueNow} past first-reply deadline`} href="/dashboard/support" />
            <StatCard label="Approved riders" value={formatNumber(m.live.approvedRiders)} />
          </StatGrid>

          <h2 className="adm-section-title">Money</h2>
          <StatGrid>
            <StatCard label="Owed to vendors" value={formatNaira(m.money.owedToVendors)} href="/dashboard/payouts" />
            <StatCard label="Paid out that day" value={formatNaira(m.money.paidOut)} />
            <StatCard label="Commission earned" value={formatNaira(m.money.commission)} />
            <StatCard label="Payouts needing attention" value={formatNumber(m.money.payoutsNeedingAttention)} actionable={m.money.payoutsNeedingAttention > 0} href="/dashboard/payouts?tab=payouts" />
          </StatGrid>

          <h2 className="adm-section-title">Growth and health</h2>
          <StatGrid>
            <StatCard label="New accounts" value={formatNumber(m.growth.signups.consumers + m.growth.signups.vendors + m.growth.signups.riders)} caption={`${m.growth.signups.consumers} consumers · ${m.growth.signups.vendors} vendors · ${m.growth.signups.riders} riders`} />
            <StatCard label="Awaiting approval" value={formatNumber(m.growth.pendingVendors + m.growth.pendingRiders)} caption={m.growth.oldestPendingDays != null ? `oldest ${m.growth.oldestPendingDays}d` : undefined} href="/dashboard/vendors?status=PENDING" />
            <StatCard label="Server errors" value={formatNumber(m.reliability.serverErrors)} caption={`${m.reliability.serverWarnings} warnings`} href="/dashboard/server-logs" />
            <StatCard label="Emails sent" value={formatNumber(m.marketing.emailsSent)} caption={`${m.marketing.campaignsSent} campaign${m.marketing.campaignsSent === 1 ? '' : 's'}`} />
          </StatGrid>
        </>
      )}
    </div>
  );
}
