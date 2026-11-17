'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { bugsModule } from '@/admin/modules/bugs';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { StatCard, StatGrid } from '@/admin/primitives/stat-card';
import { Modal } from '@/admin/primitives/dialog';
import { LoadingState } from '@/admin/primitives/states';
import { formatRelative } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { Can } from '@/admin/permissions/use-permission';
import type { BugSummary, TesterRow } from '@/admin/modules/bug-types';

export default function BugsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <BugInbox />
    </Suspense>
  );
}

function BugInbox() {
  const [summary, setSummary] = useState<BugSummary | null>(null);
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    getJson<BugSummary>('/bugs/summary')
      .then(setSummary)
      .catch(() => setSummary(null)); // the list below reports its own errors
  }, []);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Bug reports</h1>
          <p className="adm-page-meta">
            Reports from your invited beta testers. Testers file them at the website’s <code>/testers</code> page and are emailed when a fix is ready to retest.
          </p>
        </div>
        <div className="adm-page-actions">
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => setManaging(true)}>
            Testers{summary ? ` (${summary.activeTesters})` : ''}
          </button>
        </div>
      </header>

      <StatGrid>
        <StatCard label="New" value={String(summary?.new ?? 0)} caption="Not looked at yet" href="/dashboard/bugs?status=NEW" loading={!summary} />
        <StatCard
          label="Critical open"
          value={String(summary?.criticalOpen ?? 0)}
          caption="Crashes, money, sign-in"
          actionable={(summary?.criticalOpen ?? 0) > 0}
          href="/dashboard/bugs?severity=CRITICAL&status=active"
          loading={!summary}
        />
        <StatCard
          label="Unassigned"
          value={String(summary?.unassigned ?? 0)}
          caption={summary ? `${summary.assignedToMe} assigned to you` : undefined}
          actionable={(summary?.unassigned ?? 0) > 0}
          href="/dashboard/bugs?assignee=unassigned&status=active"
          loading={!summary}
        />
        <StatCard
          label="Awaiting retest"
          value={String(summary?.awaitingRetest ?? 0)}
          caption={summary && summary.needsInfo > 0 ? `${summary.needsInfo} waiting on a tester` : 'Fixed, tester to confirm'}
          href="/dashboard/bugs?status=FIXED"
          loading={!summary}
        />
      </StatGrid>

      <ResourceList config={bugsModule} />

      {managing && <TestersModal onClose={() => setManaging(false)} />}
    </div>
  );
}

/* ----------------------------------------------------------------- testers --- */

function TestersModal({ onClose }: { onClose: () => void }) {
  const [testers, setTesters] = useState<TesterRow[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getJson<{ data: TesterRow[] }>('/bugs/testers?limit=100')
      .then((r) => setTesters(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(load, [load]);

  const valid = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email);

  async function invite() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await sendJson<{ emailed: boolean }>('POST', '/bugs/testers', form);
      setNotice(
        res.emailed
          ? `Invite sent to ${form.email}.`
          : `${form.email} was added, but the invite email could not be sent. Tell them to sign in at /testers on the website.`
      );
      setForm({ name: '', email: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(t: TesterRow, isActive: boolean) {
    setError(null);
    try {
      await sendJson('PATCH', `/bugs/testers/${t.id}`, { isActive });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal title="Beta testers" onClose={onClose} wide>
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="adm-alert" role="status">
          {notice}
        </div>
      )}

      <Can permission="bugs.testers">
        <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', alignItems: 'end' }}>
          <label className="adm-field">
            <span className="adm-field-label">Name</span>
            <input className="adm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="adm-field">
            <span className="adm-field-label">Email</span>
            <input type="email" className="adm-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!valid || busy} onClick={invite}>
            {busy ? 'Inviting…' : 'Invite tester'}
          </button>
        </div>
        <p className="adm-field-help">They are emailed a link to the tracker and sign in with a one-time code sent to this address.</p>
      </Can>

      {!testers ? (
        <p className="adm-muted">Loading…</p>
      ) : testers.length === 0 ? (
        <p className="adm-muted">No testers yet. Invite your first one above.</p>
      ) : (
        <ul className="adm-doc-list" style={{ marginTop: 'var(--space-4)' }}>
          {testers.map((t) => (
            <li key={t.id} className="adm-doc-item">
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                {t.name} <StatusBadge value={t.isActive ? 'ACTIVE' : 'INACTIVE'} />
                <span className="adm-td-sub">
                  {t.email} · {t.reportCount} report{t.reportCount === 1 ? '' : 's'} ·{' '}
                  {t.lastLoginAt ? `last signed in ${formatRelative(t.lastLoginAt)}` : 'never signed in'}
                </span>
              </span>
              <Can permission="bugs.testers">
                <span className="adm-row-actions">
                  {t.isActive ? (
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setActive(t, false)}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => setActive(t, true)}>
                      Reactivate
                    </button>
                  )}
                </span>
              </Can>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
