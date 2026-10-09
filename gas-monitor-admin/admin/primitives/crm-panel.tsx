'use client';

import { useCallback, useEffect, useState } from 'react';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import { usePermission } from '@/admin/permissions/use-permission';
import type { CrmProfile } from '@/admin/modules/types';

/**
 * Private CRM context on an account: tags, internal notes, and follow-up
 * tasks. Rendered inside the user detail modal so it is reachable from every
 * list that opens an account (vendors, riders, customers, users).
 */
export function CrmPanel({ userId }: { userId: string }) {
  const canNote = usePermission('crm.note');
  const canManage = usePermission('crm.manage');
  const [profile, setProfile] = useState<CrmProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tag, setTag] = useState('');
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getJson<CrmProfile>(`/crm/profiles/${userId}`)
      .then((p) => {
        setProfile(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [userId]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) return error ? <p className="adm-inline-error">{error}</p> : <p className="adm-muted">Loading CRM…</p>;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      <div>
        <h4 className="adm-micro-label">Tags</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
          {profile.tags.length === 0 && <span className="adm-muted">No tags</span>}
          {profile.tags.map((t) => (
            <span key={t.id} className="adm-badge adm-badge--neutral">
              {t.name}
              {canNote && (
                <button
                  type="button"
                  className="adm-link"
                  aria-label={`Remove tag ${t.name}`}
                  disabled={busy}
                  style={{ marginLeft: 6 }}
                  onClick={() => run(() => sendJson('DELETE', `/crm/profiles/${userId}/tags/${t.id}`))}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {canNote && (
            <form
              style={{ display: 'flex', gap: 'var(--space-2)' }}
              onSubmit={(e) => {
                e.preventDefault();
                if (tag.trim().length < 2) return;
                run(async () => {
                  await sendJson('POST', `/crm/profiles/${userId}/tags`, { name: tag });
                  setTag('');
                });
              }}
            >
              <input className="adm-input" aria-label="Add tag" placeholder="Add tag…" value={tag} onChange={(e) => setTag(e.target.value)} style={{ width: 140 }} />
              <button type="submit" className="adm-btn adm-btn--sm" disabled={busy || tag.trim().length < 2}>
                Add
              </button>
            </form>
          )}
        </div>
      </div>

      <div>
        <h4 className="adm-micro-label">Internal notes ({profile.notes.length})</h4>
        {canNote && (
          <div style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <textarea
              className="adm-input"
              rows={2}
              aria-label="New note"
              placeholder="Visible to admins only…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="adm-dialog-actions">
              <button
                type="button"
                className="adm-btn adm-btn--sm adm-btn--primary"
                disabled={busy || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await sendJson('POST', `/crm/profiles/${userId}/notes`, { body: note });
                    setNote('');
                  })
                }
              >
                Add note
              </button>
            </div>
          </div>
        )}
        {profile.notes.length === 0 ? (
          <p className="adm-muted">No notes yet.</p>
        ) : (
          <ul className="adm-doc-list">
            {profile.notes.map((n) => (
              <li key={n.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                  {n.body}
                  <span className="adm-td-sub">{n.authorName}</span>
                </span>
                <span className="adm-row-actions">
                  <span className="adm-muted" title={formatDateTime(n.createdAt)}>
                    {formatRelative(n.createdAt)}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm adm-btn--danger"
                      disabled={busy}
                      onClick={() => run(() => sendJson('DELETE', `/crm/notes/${n.id}`))}
                    >
                      Delete
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h4 className="adm-micro-label">Tasks ({profile.tasks.filter((t) => t.status === 'OPEN').length} open)</h4>
        {profile.tasks.length > 0 && (
          <ul className="adm-doc-list">
            {profile.tasks.map((t) => (
              <li key={t.id} className="adm-doc-item">
                <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', minWidth: 0 }}>
                  <input
                    type="checkbox"
                    className="adm-checkbox"
                    checked={t.status === 'DONE'}
                    disabled={!canManage || busy}
                    onChange={(e) => run(() => sendJson('PATCH', `/crm/tasks/${t.id}`, { status: e.target.checked ? 'DONE' : 'OPEN' }))}
                  />
                  <span style={{ overflowWrap: 'anywhere', textDecoration: t.status === 'DONE' ? 'line-through' : undefined }}>{t.title}</span>
                </label>
                <span className="adm-muted">{t.dueAt ? formatDateTime(t.dueAt) : 'No date'}</span>
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <input className="adm-input" aria-label="New task" placeholder="Add a follow-up…" value={task} onChange={(e) => setTask(e.target.value)} />
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              disabled={busy || task.trim().length < 2}
              onClick={() =>
                run(async () => {
                  await sendJson('POST', '/crm/tasks', { title: task, userId });
                  setTask('');
                })
              }
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
