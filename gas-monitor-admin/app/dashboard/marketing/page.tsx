'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResourceList } from '@/admin/resource/resource-list';
import { campaignsModule, suppressionsModule } from '@/admin/modules/marketing';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { ConfirmDialog, Modal } from '@/admin/primitives/dialog';
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from '@/admin/primitives/states';
import { formatNumber, humaniseEnum } from '@/admin/primitives/format';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import type { MarketingOverview, SegmentFilter, SegmentRow } from '@/admin/modules/types';
import { CampaignModal, SegmentModal } from './marketing-modals';

/**
 * Marketing email: audiences, campaigns and the suppression list.
 * Email only for now (via Resend). Every campaign carries an unsubscribe link,
 * and unsubscribed addresses are excluded at send time.
 */

type Tab = 'campaigns' | 'audiences' | 'suppressed';
const TABS: { value: Tab; label: string }[] = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'audiences', label: 'Audiences' },
  { value: 'suppressed', label: 'Unsubscribed' }
];

export default function MarketingPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MarketingView />
    </Suspense>
  );
}

function describeFilter(f: SegmentFilter): string {
  const parts: string[] = [];
  parts.push(f.roles.length ? f.roles.map((r) => humaniseEnum(r).toLowerCase() + 's').join(' + ') : 'all accounts');
  if (f.vendorStatus) parts.push(`${humaniseEnum(f.vendorStatus).toLowerCase()} vendors`);
  if (f.state) parts.push(`vendors in ${f.state}`);
  if (f.hasOrdered === true) parts.push('has ordered');
  if (f.hasOrdered === false) parts.push('never ordered');
  if (f.joinedWithinDays) parts.push(`joined in last ${f.joinedWithinDays}d`);
  if (f.tag) parts.push(`tagged “${f.tag}”`);
  return parts.join(' · ');
}

function MarketingView() {
  const canRead = usePermission('marketing.read');
  const router = useRouter();
  const params = useSearchParams();
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'campaigns') as Tab;

  const [overview, setOverview] = useState<MarketingOverview | null>(null);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [version, setVersion] = useState(0);
  const [campaignModal, setCampaignModal] = useState<{ id: string | null } | null>(null);
  const [segmentModal, setSegmentModal] = useState<{ segment: SegmentRow | null } | null>(null);
  const [addingEmail, setAddingEmail] = useState(false);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!canRead) return;
    getJson<MarketingOverview>('/marketing/overview').then(setOverview).catch(() => setOverview(null));
    getJson<{ segments: SegmentRow[] }>('/marketing/segments').then((r) => setSegments(r.segments)).catch(() => setSegments([]));
  }, [canRead, version]);

  if (!canRead) return <ForbiddenState permission="marketing.read" />;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Marketing</h1>
          <p className="adm-page-meta">Email campaigns to saved audiences. Every email carries an unsubscribe link.</p>
        </div>
        <div className="adm-page-actions">
          <Can permission="marketing.manage">
            {tab === 'audiences' ? (
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => setSegmentModal({ segment: null })}>
                New audience
              </button>
            ) : tab === 'suppressed' ? (
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => setAddingEmail(true)}>
                Add address
              </button>
            ) : (
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCampaignModal({ id: null })}>
                New campaign
              </button>
            )}
          </Can>
        </div>
      </header>

      <StatGrid>
        <StatCard label="Campaigns" value={formatNumber(overview?.campaigns ?? 0)} caption={overview?.sending ? `${overview.sending} sending now` : undefined} loading={!overview} />
        <StatCard label="Emails sent (30d)" value={formatNumber(overview?.sent30 ?? 0)} loading={!overview} />
        <StatCard
          label="Failed (30d)"
          value={formatNumber(overview?.failed30 ?? 0)}
          actionable={(overview?.failed30 ?? 0) > 0}
          caption="Includes recipients who unsubscribed mid-send"
          loading={!overview}
        />
        <StatCard label="Unsubscribed" value={formatNumber(overview?.suppressed ?? 0)} href="/dashboard/marketing?tab=suppressed" loading={!overview} />
      </StatGrid>

      <div className="adm-segmented" role="tablist" aria-label="Marketing views">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            className="adm-segment"
            aria-pressed={tab === t.value}
            aria-selected={tab === t.value}
            onClick={() => router.replace(t.value === 'campaigns' ? '/dashboard/marketing' : `/dashboard/marketing?tab=${t.value}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'campaigns' && <ResourceList key={version} config={campaignsModule} onRowOpen={(c) => setCampaignModal({ id: c.id })} />}
      {tab === 'audiences' && <AudiencesPanel key={version} segments={segments} onEdit={(s) => setSegmentModal({ segment: s })} onChanged={reload} />}
      {tab === 'suppressed' && <ResourceList key={version} config={suppressionsModule} />}

      {campaignModal && (
        <CampaignModal campaignId={campaignModal.id} segments={segments} onClose={() => setCampaignModal(null)} onChanged={reload} />
      )}
      {segmentModal && (
        <SegmentModal
          segment={segmentModal.segment}
          onClose={() => setSegmentModal(null)}
          onSaved={() => {
            setSegmentModal(null);
            reload();
          }}
        />
      )}
      {addingEmail && (
        <AddSuppressionModal
          onClose={() => setAddingEmail(false)}
          onAdded={() => {
            setAddingEmail(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- audiences --- */

function AudiencesPanel({
  segments,
  onEdit,
  onChanged
}: {
  segments: SegmentRow[];
  onEdit: (s: SegmentRow) => void;
  onChanged: () => void;
}) {
  const canManage = usePermission('marketing.manage');
  const [removing, setRemoving] = useState<SegmentRow | null>(null);
  const [error, setError] = useState<Error | null>(null);

  if (error) return <ErrorState title="Could not delete the audience" error={error} onRetry={() => setError(null)} />;
  if (segments.length === 0) {
    return (
      <EmptyState
        title="No audiences yet"
        description="An audience is a saved rule — for example “approved vendors in Lagos” — that campaigns send to. It is re-evaluated every time you send."
      />
    );
  }

  return (
    <>
      <ul className="adm-card-list">
        {segments.map((s) => (
          <li key={s.id} className="adm-card adm-card-pad" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 0 }}>
              <strong>{s.name}</strong>
              <span className="adm-td-sub">{describeFilter(s.filter)}</span>
              {s.description && <span className="adm-td-sub">{s.description}</span>}
              <span className="adm-td-sub">
                Used by {s._count?.campaigns ?? 0} campaign{s._count?.campaigns === 1 ? '' : 's'} · created by {s.createdByName}
              </span>
            </span>
            {canManage && (
              <span className="adm-row-actions">
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => onEdit(s)}>
                  Edit
                </button>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setRemoving(s)}>
                  Delete
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmDialog
          title={`Delete “${removing.name}”?`}
          body="Campaigns that used it keep their delivery record but lose their audience link, so unsent drafts will need a new audience."
          confirmLabel="Delete audience"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await sendJson('DELETE', `/marketing/segments/${removing.id}`);
              setRemoving(null);
              onChanged();
            } catch (e) {
              setRemoving(null);
              setError(e instanceof Error ? e : new Error(String(e)));
            }
          }}
        />
      )}
    </>
  );
}

function AddSuppressionModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await sendJson('POST', '/marketing/suppressions', { email, reason: reason || undefined });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add an unsubscribed address"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={busy || !/\S+@\S+\.\S+/.test(email)} onClick={submit}>
            {busy ? 'Adding…' : 'Add address'}
          </button>
        </>
      }
    >
      <p className="adm-dialog-body">For when someone asks you directly to stop. They are excluded from every future campaign.</p>
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <label className="adm-field">
          <span className="adm-field-label">Email</span>
          <input type="email" className="adm-input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Reason (optional)</span>
          <input className="adm-input" value={reason} placeholder="e.g. asked by phone" onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
