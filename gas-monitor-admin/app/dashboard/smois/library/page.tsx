'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { sendJson } from '@/lib/post';
import { Async, FormModal, PageShell, SelectField, SimpleTable, Td, TextField, Toolbar, useApi, useDebounced } from '../_ui';

interface Asset {
  id: string; name: string; description: string | null; category: string; fileType: string | null; url: string; version: number;
  approved: boolean; restrictions: string | null; expiresAt: string | null; expired: boolean; uploadedByName: string;
}
const CATEGORIES = ['LOGO', 'BRAND_GUIDELINES', 'COMPANY_PHOTO', 'EXECUTIVE_PHOTO', 'PRODUCT_PHOTO', 'DESIGN', 'VIDEO', 'TEMPLATE', 'CAMPAIGN', 'EVENT_PHOTO', 'PRESS', 'CAPTION', 'DESCRIPTION', 'OTHER'];
const human = (s: string) => s.replace(/_/g, ' ').toLowerCase();

export default function LibraryPage() {
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [adding, setAdding] = useState(false);
  const state = useApi<{ data: Asset[] }>(`/smois/assets?${category ? `category=${category}&` : ''}${dq ? `q=${encodeURIComponent(dq)}` : ''}`);
  return (
    <RequirePermission permission="smois.read">
      <PageShell title="Brand asset library" meta="Official logos, photos, templates and approved wording. Each entry links to where the file lives; files are not uploaded here."
        actions={<Can permission="smois.assets.write"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setAdding(true)}>Add asset</button></Can>}>
        <Toolbar>
          <label className="adm-field"><span className="adm-field-label">Category</span>
            <select className="adm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>{CATEGORIES.map((c) => <option key={c} value={c}>{human(c)}</option>)}
            </select>
          </label>
          <label className="adm-field"><span className="adm-field-label">Search</span><input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </Toolbar>
        <Async state={state} columns={5}>
          {({ data }) => data.length === 0 ? <EmptyState title="No assets yet" /> : (
            <SimpleTable head={['Asset', 'Category', 'Version', 'Status', '']}>
              {data.map((a) => (
                <tr key={a.id} className="adm-tr">
                  <Td sub={[a.description, a.restrictions ? `Restriction: ${a.restrictions}` : null, a.expiresAt ? `Expires ${a.expiresAt}` : null].filter(Boolean).join(' · ') || undefined}>
                    <a className="adm-link" href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                  </Td>
                  <Td sub={a.fileType ?? undefined}>{human(a.category)}</Td>
                  <Td>v{a.version}</Td>
                  <Td>{a.expired ? <StatusBadge value="EXPIRED" /> : a.approved ? <StatusBadge value="APPROVED" /> : <StatusBadge value="PENDING" />}</Td>
                  <td className="adm-td adm-td--right">
                    <div className="adm-row-actions">
                      <Can permission="smois.campaigns.manage">
                        <button type="button" className="adm-btn adm-btn--sm" onClick={async () => { await sendJson('PATCH', `/smois/assets/${a.id}`, { approved: !a.approved }); state.reload(); }}>{a.approved ? 'Withdraw approval' : 'Approve'}</button>
                      </Can>
                      <Can permission="smois.assets.write">
                        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={async () => { await sendJson('PATCH', `/smois/assets/${a.id}`, { archived: true }); state.reload(); }}>Archive</button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </SimpleTable>
          )}
        </Async>
        {adding && <AssetForm onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function AssetForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', category: 'OTHER', url: '', fileType: '', description: '', restrictions: '', expiresAt: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const n = (v: string) => v.trim() || null;
  return (
    <FormModal title="Add asset" onClose={onClose} submitLabel="Add" disabled={f.name.trim().length < 2 || !f.url.trim()}
      onSubmit={async () => { await sendJson('POST', '/smois/assets', { ...f, fileType: n(f.fileType), description: n(f.description), restrictions: n(f.restrictions), expiresAt: n(f.expiresAt) }); onDone(); }}>
      <TextField label="Name" value={f.name} onChange={set('name')} required />
      <SelectField label="Category" value={f.category} onChange={set('category')} options={CATEGORIES.map((c) => ({ value: c, label: human(c) }))} />
      <TextField label="Link to the file" type="url" value={f.url} onChange={set('url')} required help="Where it is stored: shared drive, design tool, etc." />
      <TextField label="File type" value={f.fileType} onChange={set('fileType')} placeholder="PNG, PDF, MP4…" />
      <TextField label="Description" value={f.description} onChange={set('description')} />
      <TextField label="Usage restrictions" value={f.restrictions} onChange={set('restrictions')} />
      <TextField label="Expires" type="date" value={f.expiresAt} onChange={set('expiresAt')} />
    </FormModal>
  );
}
