'use client';

import { Suspense, useEffect, useState } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { waitlistModule } from '@/admin/modules/waitlist';
import { getJson } from '@/admin/data/source';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { LoadingState } from '@/admin/primitives/states';
import { formatNumber } from '@/admin/primitives/format';
import type { WaitlistSummary } from '@/admin/modules/types';

export default function WaitlistPage() {
  const [summary, setSummary] = useState<WaitlistSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    getJson<WaitlistSummary>('/waitlist/summary')
      .then(setSummary)
      .catch((e: Error) => setFailed(e.message));
  }, []);

  const top = summary?.cities[0];

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Waitlist</h1>
          <p className="adm-page-meta">People who signed up for early access on the landing page.</p>
        </div>
      </header>

      {failed && (
        <div className="adm-alert" role="alert">
          <span>{failed}</span>
        </div>
      )}

      <StatGrid columns={4}>
        <StatCard label="Total sign-ups" value={formatNumber(summary?.total ?? 0)} loading={!summary && !failed} />
        <StatCard label="Last 7 days" value={formatNumber(summary?.last7d ?? 0)} loading={!summary && !failed} />
        <StatCard label="Cities" value={formatNumber(summary?.cityCount ?? 0)} loading={!summary && !failed} />
        <StatCard
          label="Top city"
          value={top ? `${top.city} (${formatNumber(top.signups)})` : '—'}
          loading={!summary && !failed}
        />
      </StatGrid>

      <Suspense fallback={<LoadingState />}>
        <ResourceList config={waitlistModule} />
      </Suspense>
    </div>
  );
}
