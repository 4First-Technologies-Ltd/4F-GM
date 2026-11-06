'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState } from '@/admin/primitives/states';
import { formatDate } from '@/admin/primitives/format';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, PLATFORM_LABEL, PageShell, SelectField, SimpleTable, Td, TextArea, TextField, useApi, useTeam,
  type Page
} from '../_ui';

interface Assignment {
  id: string; adminId: string; adminName: string; isPrimary: boolean; startsAt: string; endsAt: string | null; reason: string | null;
  assignedByName: string;
}
interface Account {
  id: string; platform: string; name: string; handle: string; url: string | null; category: string | null; accountType: string;
  description: string | null; notes: string | null; connection: string; isActive: boolean; lastSyncedAt: string | null;
  assignments: Assignment[];
}

const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }));

export default function SocialAccountsPage() {
  const state = useApi<Page<Account>>('/smois/accounts?limit=100&active=all');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<Account | null>(null);

  return (
    <RequirePermission permission="smois.read">
      <PageShell
        title="Social accounts"
        meta="The company's official accounts. They belong to the company, and every manager works from the same record."
        actions={
          <Can permission="smois.accounts">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>Register account</button>
          </Can>
        }
      >
        <Async state={state} columns={5}>
          {(page) =>
            page.data.length === 0 ? (
              <EmptyState title="No accounts registered" description="A super admin registers the company's accounts here. Registering records the account; it does not connect to the platform." />
            ) : (
              <SimpleTable head={['Account', 'Platform', 'Connection', 'Team', '']}>
                {page.data.map((a) => (
                  <>
                    <tr key={a.id} className="adm-tr">
                      <Td sub={a.handle}>
                        {a.name}
                        {!a.isActive && <> <StatusBadge value="INACTIVE" /></>}
                      </Td>
                      <Td>{PLATFORM_LABEL[a.platform] ?? a.platform}</Td>
                      <Td sub={a.connection === 'MANUAL' ? 'Figures entered by hand' : a.lastSyncedAt ? `Synced ${formatDate(a.lastSyncedAt)}` : 'Never synced'}>
                        <StatusBadge value={a.connection} />
                      </Td>
                      <Td>
                        {a.assignments.length === 0 ? <span className="adm-muted">Nobody assigned</span> : a.assignments.map((x) => `${x.adminName}${x.isPrimary ? ' (primary)' : ''}`).join(', ')}
                      </Td>
                      <td className="adm-td adm-td--right">
                        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setOpen(open === a.id ? null : a.id)}>
                          {open === a.id ? 'Hide' : 'Team and history'}
                        </button>
                      </td>
                    </tr>
                    {open === a.id && (
                      <tr key={`${a.id}-d`}>
                        <td colSpan={5} className="adm-td">
                          <AccountDetail account={a} onAssign={() => setAssigning(a)} onChanged={state.reload} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </SimpleTable>
            )
          }
        </Async>

        {creating && <NewAccount onClose={() => setCreating(false)} onDone={() => { setCreating(false); state.reload(); }} />}
        {assigning && <AssignModal account={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); state.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function AccountDetail({ account, onAssign, onChanged }: { account: Account; onAssign: () => void; onChanged: () => void }) {
  const detail = useApi<{ account: Account }>(`/smois/accounts/${account.id}`);
  const [ending, setEnding] = useState<Assignment | null>(null);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {account.url && <a className="adm-link" href={account.url} target="_blank" rel="noreferrer">{account.url}</a>}
      {account.description && <p>{account.description}</p>}
      {account.notes && <p className="adm-muted">{account.notes}</p>}
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <Can permission="smois.assign"><button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={onAssign}>Assign a team member</button></Can>
        <Can permission="smois.accounts">
          <button type="button" className="adm-btn adm-btn--sm" onClick={async () => { await sendJson('PATCH', `/smois/accounts/${account.id}`, { isActive: !account.isActive }); onChanged(); }}>
            {account.isActive ? 'Deactivate account' : 'Reactivate account'}
          </button>
        </Can>
      </div>
      <h3 className="adm-micro-label">Assignment history</h3>
      <Async state={detail} columns={4}>
        {({ account: a }) => (
          <SimpleTable head={['Team member', 'From', 'Until', 'Assigned by', '']} empty={a.assignments.length === 0 ? 'No one has been assigned yet.' : undefined}>
            {a.assignments.map((x) => (
              <tr key={x.id} className="adm-tr">
                <Td sub={x.reason}>{x.adminName}{x.isPrimary ? ' · primary' : ''}</Td>
                <Td>{formatDate(x.startsAt)}</Td>
                <Td>{x.endsAt && new Date(x.endsAt) <= new Date() ? formatDate(x.endsAt) : <StatusBadge value="ACTIVE" />}</Td>
                <Td>{x.assignedByName}</Td>
                <td className="adm-td adm-td--right">
                  {!(x.endsAt && new Date(x.endsAt) <= new Date()) && (
                    <Can permission="smois.assign"><button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setEnding(x)}>End</button></Can>
                  )}
                </td>
              </tr>
            ))}
          </SimpleTable>
        )}
      </Async>
      {ending && <EndAssignment a={ending} onClose={() => setEnding(null)} onDone={() => { setEnding(null); detail.reload(); onChanged(); }} />}
    </div>
  );
}

function NewAccount({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ platform: 'FACEBOOK', name: '', handle: '', url: '', category: '', accountType: 'BUSINESS', description: '', notes: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <FormModal title="Register a social account" onClose={onClose} submitLabel="Register" disabled={f.name.trim().length < 2 || !f.handle.trim()}
      onSubmit={async () => {
        await sendJson('POST', '/smois/accounts', { ...f, url: f.url || null, category: f.category || null, description: f.description || null, notes: f.notes || null });
        onDone();
      }}>
      <SelectField label="Platform" value={f.platform} onChange={set('platform')} options={PLATFORM_OPTIONS} />
      <TextField label="Account name" value={f.name} onChange={set('name')} required />
      <TextField label="Handle" value={f.handle} onChange={set('handle')} required placeholder="@4fgmonitor" />
      <TextField label="Profile URL" value={f.url} onChange={set('url')} type="url" />
      <TextField label="Category" value={f.category} onChange={set('category')} placeholder="e.g. Brand, Support, Recruitment" />
      <SelectField label="Account type" value={f.accountType} onChange={set('accountType')} options={[{ value: 'BUSINESS', label: 'Business' }, { value: 'CREATOR', label: 'Creator' }, { value: 'PERSONAL', label: 'Personal' }]} />
      <TextArea label="Description" value={f.description} onChange={set('description')} rows={2} />
      <TextArea label="Notes" value={f.notes} onChange={set('notes')} rows={2} help="Who holds the recovery email and phone for this account? It should be the company, not one employee." />
    </FormModal>
  );
}

function AssignModal({ account, onClose, onDone }: { account: Account; onClose: () => void; onDone: () => void }) {
  const team = useTeam();
  const [adminId, setAdminId] = useState('');
  const [isPrimary, setPrimary] = useState(false);
  const [reason, setReason] = useState('');
  const members = team.data?.data ?? [];
  return (
    <FormModal title={`Assign to ${account.name}`} onClose={onClose} submitLabel="Assign" disabled={!adminId}
      onSubmit={async () => { await sendJson('POST', `/smois/accounts/${account.id}/assign`, { adminId, isPrimary, reason: reason || null }); onDone(); }}>
      <SelectField label="Team member" value={adminId} onChange={setAdminId} required
        options={[{ value: '', label: team.loading ? 'Loading…' : 'Choose…' }, ...members.map((m) => ({ value: m.id, label: `${m.name} · ${m.smosRole ?? m.role}` }))]}
        help="Only admins with a social media role appear. Give someone one under Admin users." />
      <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <input type="checkbox" className="adm-checkbox" checked={isPrimary} onChange={(e) => setPrimary(e.target.checked)} />
        Primary responsibility for this account
      </label>
      <TextField label="Reason (optional)" value={reason} onChange={setReason} />
    </FormModal>
  );
}

function EndAssignment({ a, onClose, onDone }: { a: Assignment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <FormModal title={`End ${a.adminName}'s assignment`} onClose={onClose} submitLabel="End assignment" disabled={reason.trim().length < 2}
      onSubmit={async () => { await sendJson('POST', `/smois/assignments/${a.id}/end`, { reason }); onDone(); }}>
      <p className="adm-muted">The assignment stays in the history. Their past work stays attributed to them.</p>
      <TextField label="Why is it ending?" value={reason} onChange={setReason} required />
    </FormModal>
  );
}
