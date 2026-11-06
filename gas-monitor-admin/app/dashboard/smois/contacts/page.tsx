'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { EmptyState } from '@/admin/primitives/states';
import { sendJson } from '@/lib/post';
import { Async, FormModal, PLATFORM_LABEL, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, Toolbar, useApi, useDebounced, type Page } from '../_ui';

interface Contact {
  id: string; platform: string; displayName: string; username: string | null; email: string | null; phone: string | null; location: string | null;
  category: string; tags: string[]; notes: string | null; consentNote: string | null; _count: { conversations: number };
}
const CATEGORIES = ['PROSPECT', 'CUSTOMER', 'POTENTIAL', 'PARTNER', 'INFLUENCER', 'MEDIA', 'APPLICANT', 'SUPPORT_CASE', 'OTHER'];

export default function ContactsPage() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [creating, setCreating] = useState(false);
  const state = useApi<Page<Contact>>(`/smois/contacts?limit=50${dq ? `&q=${encodeURIComponent(dq)}` : ''}`);
  return (
    <RequirePermission permission="smois.inbox.work">
      <PageShell
        title="Contacts and audience"
        meta="People who deal with the company on social media. Keep only what they chose to share, and note how they agreed."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>Add contact</button>}
      >
        <Toolbar>
          <label className="adm-field">
            <span className="adm-field-label">Search</span>
            <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, handle or email…" />
          </label>
        </Toolbar>
        <Async state={state} columns={5}>
          {(p) =>
            p.data.length === 0 ? (
              <EmptyState title="No contacts yet" />
            ) : (
              <SimpleTable head={['Contact', 'Platform', 'Category', 'Details', 'Conversations', '']}>
                {p.data.map((c) => (
                  <tr key={c.id} className="adm-tr">
                    <Td sub={c.username}>{c.displayName}</Td>
                    <Td>{PLATFORM_LABEL[c.platform]}</Td>
                    <Td sub={c.tags.join(', ') || undefined}>{c.category.replace(/_/g, ' ').toLowerCase()}</Td>
                    <Td sub={c.consentNote ? `Consent: ${c.consentNote}` : 'No consent note on file'}>
                      {[c.email, c.phone, c.location].filter(Boolean).join(' · ') || <span className="adm-muted">None shared</span>}
                    </Td>
                    <Td>{c._count.conversations}</Td>
                    <td className="adm-td adm-td--right">
                      <Can permission="smois.campaigns.manage">
                        <button type="button" className="adm-btn adm-btn--sm adm-btn--danger"
                          onClick={async () => {
                            if (window.confirm(`Erase ${c.displayName}? Their conversations stay, unlinked.`)) {
                              await sendJson('DELETE', `/smois/contacts/${c.id}`);
                              state.reload();
                            }
                          }}>Erase</button>
                      </Can>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
            )
          }
        </Async>
        {creating && <NewContact onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function NewContact({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ platform: 'INSTAGRAM', displayName: '', username: '', email: '', phone: '', location: '', category: 'OTHER', tags: '', notes: '', consentNote: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const n = (v: string) => v.trim() || null;
  return (
    <FormModal title="Add contact" onClose={onClose} submitLabel="Add" disabled={!f.displayName.trim()}
      onSubmit={async () => {
        await sendJson('POST', '/smois/contacts', {
          ...f, username: n(f.username), email: n(f.email), phone: n(f.phone), location: n(f.location), notes: n(f.notes), consentNote: n(f.consentNote),
          tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean)
        });
        onDone();
      }}>
      <SelectField label="Platform" value={f.platform} onChange={set('platform')} options={Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }))} />
      <TextField label="Name" value={f.displayName} onChange={set('displayName')} required />
      <TextField label="Username" value={f.username} onChange={set('username')} />
      <TextField label="Email (only if they gave it)" type="email" value={f.email} onChange={set('email')} />
      <TextField label="Phone (only if they gave it)" value={f.phone} onChange={set('phone')} />
      <TextField label="Location" value={f.location} onChange={set('location')} />
      <SelectField label="Category" value={f.category} onChange={set('category')} options={CATEGORIES.map((x) => ({ value: x, label: x.replace(/_/g, ' ').toLowerCase() }))} />
      <TextField label="Tags (comma separated)" value={f.tags} onChange={set('tags')} />
      <TextField label="How did they agree to be contacted?" value={f.consentNote} onChange={set('consentNote')} help="For example: gave their email in a DM asking for a callback." />
      <TextArea label="Notes" value={f.notes} onChange={set('notes')} rows={2} />
    </FormModal>
  );
}
