'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { usePermission } from '@/admin/permissions/use-permission';
import { EmptyState, InlineError } from '@/admin/primitives/states';
import { sendJson } from '@/lib/post';
import { PageShell, PeriodBar, SelectField, TextArea, daysAgoIso, todayIso, useApi } from '../_ui';

const CONTENT_TASKS = [
  { value: 'caption', label: 'Caption options' },
  { value: 'ideas', label: 'Post ideas' },
  { value: 'hashtags', label: 'Hashtags' },
  { value: 'repurpose', label: 'Repurpose for another format' },
  { value: 'rewrite', label: 'Rewrite for a platform' },
  { value: 'grammar', label: 'Fix spelling and grammar' },
  { value: 'tone', label: 'Improve tone' },
  { value: 'brief', label: 'Content brief' }
];
const EXAMPLES = ['How did we perform in this period?', 'Which account grew the most?', 'Which targets are at risk?', 'How many posts did each person record?', 'What should we prioritise next?'];

export default function AssistantPage() {
  const status = useApi<{ enabled: boolean; model: string | null }>('/smois/ai/status');
  const canAsk = usePermission('smois.analytics.read');
  const canWrite = usePermission('smois.content.create');

  return (
    <RequirePermission permission="smois.read">
      <PageShell title="AI assistant" meta="Drafts copy and answers questions about your own recorded data. It never publishes, and it cannot see message text or contact details.">
        {status.data && !status.data.enabled && (
          <EmptyState title="The assistant is switched off" description="A super admin turns it on by setting ANTHROPIC_API_KEY on the backend." />
        )}
        {status.data?.enabled && (
          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            {canAsk && <Ask />}
            {canWrite && <Write />}
            <p className="adm-filter-note">Everything here is an AI draft. Check facts and numbers before you use it. Model: {status.data.model}.</p>
          </div>
        )}
      </PageShell>
    </RequirePermission>
  );
}

function Ask() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ answer: string; basis: unknown } | null>(null);
  const ask = async () => {
    setBusy(true); setError(null); setRes(null);
    try {
      setRes(await sendJson('POST', `/smois/ai/ask?from=${from}&to=${to}`, { question }));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <section className="adm-card adm-card-pad" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <h2 className="adm-section-title">Ask about the data</h2>
      <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
      <TextArea label="Your question" value={question} onChange={setQuestion} rows={2} />
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        {EXAMPLES.map((x) => <button key={x} type="button" className="adm-btn adm-btn--sm" onClick={() => setQuestion(x)}>{x}</button>)}
      </div>
      <div><button type="button" className="adm-btn adm-btn--primary" disabled={busy || question.trim().length < 5} onClick={ask}>{busy ? 'Thinking…' : 'Ask'}</button></div>
      {error && <InlineError message={error} />}
      {res && (
        <>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{res.answer}</p>
          <details>
            <summary className="adm-muted">Data the answer was based on</summary>
            <pre style={{ overflow: 'auto', maxHeight: 320, fontSize: 12 }}>{JSON.stringify(res.basis, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}

function Write() {
  const [task, setTask] = useState('caption');
  const [platform, setPlatform] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null); setText(null);
    try {
      const r = await sendJson<{ text: string }>('POST', '/smois/ai/content', { task, platform: platform || undefined, input });
      setText(r.text);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <section className="adm-card adm-card-pad" style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <h2 className="adm-section-title">Help with copy</h2>
      <SelectField label="What do you need?" value={task} onChange={setTask} options={CONTENT_TASKS} />
      <label className="adm-field"><span className="adm-field-label">Platform (optional)</span>
        <input className="adm-input" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Instagram, LinkedIn…" />
      </label>
      <TextArea label="Topic or text" value={input} onChange={setInput} rows={4} help="Do not paste customer messages or personal details." />
      <div><button type="button" className="adm-btn adm-btn--primary" disabled={busy || input.trim().length < 3} onClick={run}>{busy ? 'Writing…' : 'Generate'}</button></div>
      {error && <InlineError message={error} />}
      {text && <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', margin: 0 }}>{text}</pre>}
    </section>
  );
}
