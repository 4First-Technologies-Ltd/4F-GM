'use client';

import { Suspense, useEffect, useState } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { serverLogsModule } from '@/admin/modules/server-logs';
import { getJson } from '@/admin/data/source';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { LoadingState } from '@/admin/primitives/states';
import { formatNumber, formatRelative } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import type { ServerLogSummary } from '@/admin/modules/types';

export default function ServerLogsPage() {
  const canRead = usePermission('logs.read');
  const [summary, setSummary] = useState<ServerLogSummary | null>(null);

  useEffect(() => {
    if (!canRead) return;
    getJson<ServerLogSummary>('/logs/summary').then(setSummary).catch(() => setSummary(null));
  }, [canRead]);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Server logs</h1>
          <p className="adm-page-meta">
            Warnings and errors from the API, with secrets and OTP codes redacted
            {summary ? ` and kept for ${summary.retentionDays} days` : ''}. Super admins only.
          </p>
        </div>
      </header>

      {canRead && (
        <StatGrid columns={3}>
          <StatCard label="Errors (24h)" value={formatNumber(summary?.errors24h ?? 0)} actionable={(summary?.errors24h ?? 0) > 0} loading={!summary} />
          <StatCard label="Warnings (24h)" value={formatNumber(summary?.warnings24h ?? 0)} loading={!summary} />
          <StatCard
            label="Last error"
            value={summary?.lastErrorAt ? formatRelative(summary.lastErrorAt) : 'None'}
            loading={!summary}
          />
        </StatGrid>
      )}

      <Suspense fallback={<LoadingState />}>
        <ResourceList config={serverLogsModule} />
      </Suspense>
    </div>
  );
}
