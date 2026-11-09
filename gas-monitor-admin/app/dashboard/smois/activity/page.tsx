'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { usePermission } from '@/admin/permissions/use-permission';
import { EmptyState } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { Async, PageShell, SimpleTable, Td, Toolbar, downloadCsv, useApi, useDebounced, type Page } from '../_ui';

interface Entry { id: string; actorName: string; resource: string; resourceId: string | null; summary: string; createdAt: string }

export default function ActivityPage() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const all = usePermission('smois.activity.read');
  const canExport = usePermission('smois.export');
  const state = useApi<Page<Entry>>(`/smois/activity?limit=50&page=${page}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);

  return (
    <RequirePermission permission="smois.activity.own">
      <PageShell
        title={all ? 'Social media activity' : 'My activity'}
        meta="Every action in Social media operations, with who did it and when. Entries cannot be edited or deleted."
        actions={canExport && state.data ? (
          <button type="button" className="adm-btn" onClick={() => downloadCsv('social-activity.csv', [['When', 'Who', 'Area', 'What'], ...state.data!.data.map((e) => [e.createdAt, e.actorName, e.resource.replace('smois.', ''), e.summary])])}>Export this page</button>
        ) : undefined}
      >
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Search</span>
            <input className="adm-input" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search activity…" />
          </label>
        </Toolbar>
        <Async state={state} columns={4}>
          {(p) =>
            p.data.length === 0 ? (
              <EmptyState title="No activity" description="Actions appear here as the team works." />
            ) : (
              <>
                <SimpleTable head={['When', 'Who', 'Area', 'What happened']}>
                  {p.data.map((e) => (
                    <tr key={e.id} className="adm-tr">
                      <Td>{formatDateTime(e.createdAt)}</Td>
                      <Td>{e.actorName}</Td>
                      <Td>{e.resource.replace('smois.', '')}</Td>
                      <Td>{e.summary}</Td>
                    </tr>
                  ))}
                </SimpleTable>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginTop: 'var(--space-3)' }}>
                  <button type="button" className="adm-btn adm-btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
                  <span className="adm-muted">Page {p.pagination.page} of {p.pagination.pages} · {p.pagination.total} entries</span>
                  <button type="button" className="adm-btn adm-btn--sm" disabled={page >= p.pagination.pages} onClick={() => setPage(page + 1)}>Next</button>
                </div>
              </>
            )
          }
        </Async>
      </PageShell>
    </RequirePermission>
  );
}
