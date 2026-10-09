'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getJson } from '@/admin/data/source';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, ErrorState, ForbiddenState, LoadingBlock } from '@/admin/primitives/states';
import { formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import type { CrmOverview, LeadRow, LeadStage, LeadType } from '@/admin/modules/types';
import { LeadModal, NewLeadModal } from './lead-modal';

/**
 * Acquisition pipeline: vendors and riders being recruited, from first contact
 * to a live account. Columns are the stages; a card moves by changing its stage
 * in the lead modal (or the quick-advance button), which also writes the move
 * to the lead's timeline.
 */

const STAGES: { value: LeadStage; label: string; hint: string }[] = [
  { value: 'NEW', label: 'New', hint: 'Not contacted yet' },
  { value: 'CONTACTED', label: 'Contacted', hint: 'In conversation' },
  { value: 'ONBOARDING', label: 'Onboarding', hint: 'Signing up / awaiting approval' },
  { value: 'WON', label: 'Won', hint: 'Live on the platform' },
  { value: 'LOST', label: 'Lost', hint: 'Not proceeding' }
];

const PAGE_LIMIT = 100;

export default function PipelinePage() {
  const canRead = usePermission('crm.read');
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [overview, setOverview] = useState<CrmOverview | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [type, setType] = useState<LeadType | ''>('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    if (!canRead) return;
    const q = new URLSearchParams({ limit: String(PAGE_LIMIT), sort: 'updatedAt', dir: 'desc' });
    if (type) q.set('type', type);
    if (mine) q.set('owner', 'me');
    if (debounced) q.set('q', debounced);
    getJson<{ data: LeadRow[]; pagination: { total: number } }>(`/crm/leads?${q}`)
      .then((r) => {
        setLeads(r.data);
        setTotal(r.pagination.total);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
    getJson<CrmOverview>('/crm/overview')
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [canRead, type, mine, debounced]);

  useEffect(load, [load]);

  const byStage = useMemo(() => {
    const map: Record<LeadStage, LeadRow[]> = { NEW: [], CONTACTED: [], ONBOARDING: [], WON: [], LOST: [] };
    for (const l of leads ?? []) map[l.stage].push(l);
    return map;
  }, [leads]);

  if (!canRead) return <ForbiddenState permission="crm.read" />;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Pipeline</h1>
          <p className="adm-page-meta">Vendors and riders being recruited, from first contact to a live account.</p>
        </div>
        <div className="adm-page-actions">
          <Can permission="crm.manage">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>
              New lead
            </button>
          </Can>
        </div>
      </header>

      <StatGrid>
        <StatCard label="New this week" value={String(overview?.newThisWeek ?? 0)} loading={!overview} />
        <StatCard label="Won this week" value={String(overview?.wonThisWeek ?? 0)} loading={!overview} />
        <StatCard
          label="Follow-ups overdue"
          value={String(overview?.followUpsDue ?? 0)}
          caption="Leads past their follow-up date"
          actionable={(overview?.followUpsDue ?? 0) > 0}
          loading={!overview}
        />
        <StatCard
          label="Open tasks"
          value={String(overview?.myOpenTasks ?? 0)}
          caption={overview ? `${overview.overdueTasks} overdue across the team` : undefined}
          href="/dashboard/tasks"
          loading={!overview}
        />
      </StatGrid>

      <div className="adm-filter-bar">
        <div className="adm-filter-bar-main">
          <input
            type="search"
            className="adm-input adm-search"
            placeholder="Search name, contact, phone or city…"
            aria-label="Search leads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="adm-segmented" role="group" aria-label="Lead type">
            {([['', 'All'], ['VENDOR', 'Vendors'], ['RIDER', 'Riders']] as const).map(([v, label]) => (
              <button key={v} type="button" className="adm-segment" aria-pressed={type === v} onClick={() => setType(v)}>
                {label}
              </button>
            ))}
          </div>
          <div className="adm-segmented" role="group" aria-label="Owner">
            <button type="button" className="adm-segment" aria-pressed={!mine} onClick={() => setMine(false)}>
              Everyone
            </button>
            <button type="button" className="adm-segment" aria-pressed={mine} onClick={() => setMine(true)}>
              Mine
            </button>
          </div>
        </div>
      </div>

      {total > PAGE_LIMIT && (
        <div className="adm-alert" role="note">
          Showing the {PAGE_LIMIT} most recently updated of {total} leads. Search or filter to narrow it down.
        </div>
      )}

      {error ? (
        <ErrorState title="Could not load the pipeline" error={error} onRetry={load} />
      ) : !leads ? (
        <LoadingBlock height={320} />
      ) : leads.length === 0 && !debounced && !type && !mine ? (
        <EmptyState
          title="No leads yet"
          description="Add the vendors and riders you are recruiting and move them along as they sign up."
        />
      ) : (
        <div className="adm-board" role="list">
          {STAGES.map((s) => (
            <section key={s.value} className="adm-board-col" role="listitem" aria-label={`${s.label}, ${byStage[s.value].length} leads`}>
              <header className="adm-board-col-head">
                <span>
                  <strong>{s.label}</strong>
                  <span className="adm-td-sub">{s.hint}</span>
                </span>
                <span className="adm-badge adm-badge--neutral">{byStage[s.value].length}</span>
              </header>
              <div className="adm-board-col-body">
                {byStage[s.value].length === 0 && <p className="adm-muted adm-board-empty">Nothing here</p>}
                {byStage[s.value].map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {openId && (
        <LeadModal
          leadId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
      {creating && (
        <NewLeadModal
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            load();
            setOpenId(id);
          }}
        />
      )}
    </div>
  );
}

function LeadCard({ lead, onOpen }: { lead: LeadRow; onOpen: () => void }) {
  const overdue = !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now() && lead.stage !== 'WON' && lead.stage !== 'LOST';
  return (
    <button type="button" className="adm-board-card" onClick={onOpen}>
      <span className="adm-board-card-top">
        <strong>{lead.name}</strong>
        <StatusBadge value={lead.type} />
      </span>
      <span className="adm-td-sub">
        {[lead.contactName, [lead.city, lead.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || humaniseEnum(lead.source)}
      </span>
      <span className="adm-board-card-foot">
        {lead.nextFollowUpAt && lead.stage !== 'WON' && lead.stage !== 'LOST' ? (
          <span style={overdue ? { color: 'var(--error)' } : undefined}>
            {overdue ? 'Follow-up overdue' : `Follow up ${formatRelative(lead.nextFollowUpAt)}`}
          </span>
        ) : (
          <span className="adm-muted">Updated {formatRelative(lead.updatedAt)}</span>
        )}
        <span className="adm-muted">{lead.ownerName ?? 'Unowned'}</span>
      </span>
    </button>
  );
}
