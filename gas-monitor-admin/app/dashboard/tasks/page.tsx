'use client';

import { Suspense, useState } from 'react';
import { ResourceList } from '@/admin/resource/resource-list';
import { tasksModule } from '@/admin/modules/tasks';
import { Modal } from '@/admin/primitives/dialog';
import { LoadingState } from '@/admin/primitives/states';
import { Can } from '@/admin/permissions/use-permission';
import { sendJson } from '@/lib/post';

export default function TasksPage() {
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Tasks</h1>
          <p className="adm-page-meta">Follow-ups for the team. Add one from a lead, or here for anything else.</p>
        </div>
        <div className="adm-page-actions">
          <Can permission="crm.manage">
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setCreating(true)}>
              New task
            </button>
          </Can>
        </div>
      </header>

      <Suspense fallback={<LoadingState />}>
        <ResourceList key={version} config={tasksModule} />
      </Suspense>

      {creating && (
        <NewTaskModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [mine, setMine] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await sendJson('POST', '/crm/tasks', {
        title,
        dueAt: due ? new Date(due).toISOString() : null,
        assignee: mine ? 'me' : null
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New task"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={busy || title.trim().length < 2} onClick={submit}>
            {busy ? 'Adding…' : 'Add task'}
          </button>
        </>
      }
    >
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <label className="adm-field">
          <span className="adm-field-label">Task</span>
          <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Due</span>
          <input type="datetime-local" className="adm-input" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input type="checkbox" className="adm-checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Assign to me
        </label>
      </div>
    </Modal>
  );
}
