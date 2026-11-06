'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { EmptyState } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, ManualNote, NumField, PLATFORM_LABEL, PageShell, SimpleTable, Td, TextField, Toolbar, fmt, toInt,
  useApi, useDebounced, type Page
} from '../_ui';

interface Metric { id: string; capturedAt: string; reach: number | null; impressions: number | null; likes: number | null; comments: number | null; shares: number | null; clicks: number | null; videoViews: number | null; source: string; recordedByName: string }
interface Publication {
  id: string; url: string | null; publishedAt: string; recordedByName: string; approvedByName: string | null; bypassReason: string | null;
  content: { id: string; title: string; category: string | null; format: string; creatorName: string; account: { name: string; platform: string } };
  metrics: Metric[];
}

export default function PublishingPage() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [mine, setMine] = useState(false);
  const [recording, setRecording] = useState<Publication | null>(null);
  const state = useApi<Page<Publication>>(`/smois/publications?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ''}${mine ? '&mine=1' : ''}`);

  return (
    <RequirePermission permission="smois.read">
      <PageShell title="Publishing records" meta="A permanent record of what was posted, where, who created it, who approved it and who posted it.">
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Search</span>
            <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title…" />
          </label>
          <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', paddingBottom: 8 }}>
            <input type="checkbox" className="adm-checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Posted by me
          </label>
        </Toolbar>
        <Async state={state} columns={6}>
          {(page) =>
            page.data.length === 0 ? (
              <EmptyState title="Nothing published yet" description="When approved content is posted, record it from the content page and it appears here." />
            ) : (
              <SimpleTable head={['Post', 'Account', 'Posted', 'Created / approved / posted by', 'Latest figures', '']}>
                {page.data.map((p) => {
                  const m = p.metrics[0];
                  return (
                    <tr key={p.id} className="adm-tr">
                      <Td sub={p.url ? <a className="adm-link" href={p.url} target="_blank" rel="noreferrer">Open post</a> : 'No link recorded'}>{p.content.title}</Td>
                      <Td>{p.content.account.name} · {PLATFORM_LABEL[p.content.account.platform]}</Td>
                      <Td>{formatDateTime(p.publishedAt)}</Td>
                      <Td sub={p.bypassReason ? `Emergency bypass: ${p.bypassReason}` : undefined}>
                        {p.content.creatorName} / {p.approvedByName ?? 'no approval'} / {p.recordedByName}
                      </Td>
                      <Td sub={m ? `${m.source === 'ESTIMATED' ? 'Estimated' : 'Entered'} ${formatDateTime(m.capturedAt)}` : undefined}>
                        {m ? `Reach ${fmt(m.reach)} · Likes ${fmt(m.likes)} · Comments ${fmt(m.comments)}` : <span className="adm-muted">None recorded</span>}
                      </Td>
                      <td className="adm-td adm-td--right">
                        <Can permission="smois.metrics.record"><button type="button" className="adm-btn adm-btn--sm" onClick={() => setRecording(p)}>Add figures</button></Can>
                      </td>
                    </tr>
                  );
                })}
              </SimpleTable>
            )
          }
        </Async>
        <ManualNote />
        {recording && <MetricForm pub={recording} onClose={() => setRecording(null)} onDone={() => { setRecording(null); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function MetricForm({ pub, onClose, onDone }: { pub: Publication; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ reach: '', impressions: '', likes: '', comments: '', shares: '', clicks: '', videoViews: '' });
  const [estimated, setEstimated] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  return (
    <FormModal title={`Figures for "${pub.content.title}"`} onClose={onClose} submitLabel="Save figures" disabled={Object.values(v).every((x) => x === '')}
      onSubmit={async () => {
        await sendJson('POST', `/smois/publications/${pub.id}/metrics`, {
          ...Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toInt(x)])),
          source: estimated ? 'ESTIMATED' : 'MANUAL'
        });
        onDone();
      }}>
      <p className="adm-muted">Each save adds a new reading; earlier ones are kept. Leave a box empty if you do not have the figure.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <NumField label="Reach" value={v.reach} onChange={set('reach')} />
        <NumField label="Impressions" value={v.impressions} onChange={set('impressions')} />
        <NumField label="Likes / reactions" value={v.likes} onChange={set('likes')} />
        <NumField label="Comments" value={v.comments} onChange={set('comments')} />
        <NumField label="Shares" value={v.shares} onChange={set('shares')} />
        <NumField label="Link clicks" value={v.clicks} onChange={set('clicks')} />
        <NumField label="Video views" value={v.videoViews} onChange={set('videoViews')} />
      </div>
      <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" className="adm-checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} /> These are estimates
      </label>
    </FormModal>
  );
}
