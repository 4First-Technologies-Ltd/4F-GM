'use client';

import { useState } from 'react';
import { RequirePermission } from '@/admin/permissions/require-permission';
import { Can } from '@/admin/permissions/use-permission';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { InlineError } from '@/admin/primitives/states';
import { formatDateTime } from '@/admin/primitives/format';
import { sendJson } from '@/lib/post';
import {
  Async, FormModal, NumField, PLATFORM_LABEL, PageShell, PeriodBar, SelectField, SimpleTable, Td, TextArea, TextField,
  daysAgoIso, fmt, fmtSigned, todayIso, toInt, useApi
} from '../_ui';

interface Mention { id: string; term: string; platform: string | null; sourceUrl: string | null; excerpt: string; sentiment: string; mentionedAt: string; recordedByName: string }
interface MentionsRes { data: Mention[]; counts: Record<string, number>; alert: string | null; note: string }
interface Competitor {
  id: string; name: string; platform: string; handle: string; url: string | null; website: string | null; followerChange: number | null;
  latest: { date: string; followers: number | null; postsLastWeek: number | null; avgEngagement: number | null; basis: string } | null;
}

export default function ListeningPage() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const [logging, setLogging] = useState(false);
  const [addingComp, setAddingComp] = useState(false);
  const [reading, setReading] = useState<Competitor | null>(null);
  const mentions = useApi<MentionsRes>(`/smois/mentions?from=${from}&to=${to}`);
  const comps = useApi<{ data: Competitor[]; note: string }>('/smois/competitors');

  return (
    <RequirePermission permission="smois.analytics.read">
      <PageShell title="Listening and competitors" meta="What people say about the company, and how comparable accounts are doing. Logged by the team, not collected automatically.">
        <h2 className="adm-section-title">Brand mentions</h2>
        <PeriodBar from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <div style={{ margin: 'var(--space-3) 0' }}>
          <Can permission="smois.listening.write"><button type="button" className="adm-btn adm-btn--primary" onClick={() => setLogging(true)}>Log a mention</button></Can>
        </div>
        <Async state={mentions} columns={4}>
          {(m) => (
            <>
              {m.alert && <InlineError message={m.alert} />}
              <p className="adm-muted">
                {(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'] as const).map((s) => `${s.toLowerCase()}: ${m.counts[s] ?? 0}`).join(' · ')}
              </p>
              <SimpleTable head={['Mention', 'Where', 'Sentiment', 'When']} empty={m.data.length === 0 ? 'No mentions logged in this period.' : undefined}>
                {m.data.map((x) => (
                  <tr key={x.id} className="adm-tr">
                    <Td sub={`Term: ${x.term} · logged by ${x.recordedByName}`}>{x.excerpt}</Td>
                    <Td>{x.platform ? PLATFORM_LABEL[x.platform] : '—'}{x.sourceUrl && <> · <a className="adm-link" href={x.sourceUrl} target="_blank" rel="noreferrer">source</a></>}</Td>
                    <Td><StatusBadge value={x.sentiment} /></Td>
                    <Td>{formatDateTime(x.mentionedAt)}</Td>
                  </tr>
                ))}
              </SimpleTable>
              <p className="adm-filter-note">{m.note}</p>
            </>
          )}
        </Async>

        <h2 className="adm-section-title" style={{ marginTop: 'var(--space-6)' }}>Competitors</h2>
        <div style={{ margin: 'var(--space-3) 0' }}>
          <Can permission="smois.competitors.manage"><button type="button" className="adm-btn" onClick={() => setAddingComp(true)}>Track a competitor</button></Can>
        </div>
        <Async state={comps} columns={5}>
          {({ data, note }) => (
            <>
              <SimpleTable head={['Competitor', 'Followers', 'Change', 'Posts last week', 'Basis', '']} empty={data.length === 0 ? 'No competitors tracked.' : undefined}>
                {data.map((c) => (
                  <tr key={c.id} className="adm-tr">
                    <Td sub={`${PLATFORM_LABEL[c.platform]} · ${c.handle}`}>{c.name}</Td>
                    <Td sub={c.latest?.date}>{fmt(c.latest?.followers)}</Td>
                    <Td>{fmtSigned(c.followerChange)}</Td>
                    <Td>{fmt(c.latest?.postsLastWeek)}</Td>
                    <Td>{c.latest ? c.latest.basis.replace(/_/g, ' ').toLowerCase() : '—'}</Td>
                    <td className="adm-td adm-td--right">
                      <Can permission="smois.listening.write"><button type="button" className="adm-btn adm-btn--sm" onClick={() => setReading(c)}>Add reading</button></Can>
                    </td>
                  </tr>
                ))}
              </SimpleTable>
              <p className="adm-filter-note">{note}</p>
            </>
          )}
        </Async>

        {logging && <MentionForm onClose={() => setLogging(false)} onDone={() => { setLogging(false); mentions.reload(); }} />}
        {addingComp && <CompetitorForm onClose={() => setAddingComp(false)} onDone={() => { setAddingComp(false); comps.reload(); }} />}
        {reading && <ReadingForm c={reading} onClose={() => setReading(null)} onDone={() => { setReading(null); comps.reload(); }} />}
      </PageShell>
    </RequirePermission>
  );
}

function MentionForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ term: '', platform: '', sourceUrl: '', excerpt: '', authorHandle: '', sentiment: 'UNCERTAIN' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <FormModal title="Log a mention" onClose={onClose} submitLabel="Log" disabled={!f.term.trim() || f.excerpt.trim().length < 2}
      onSubmit={async () => { await sendJson('POST', '/smois/mentions', { ...f, platform: f.platform || null, sourceUrl: f.sourceUrl || null, authorHandle: f.authorHandle || null }); onDone(); }}>
      <TextField label="Term searched" value={f.term} onChange={set('term')} required placeholder="Company, product or campaign hashtag" />
      <SelectField label="Platform" value={f.platform} onChange={set('platform')} options={[{ value: '', label: 'Unknown' }, ...Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }))]} />
      <TextField label="Link" type="url" value={f.sourceUrl} onChange={set('sourceUrl')} />
      <TextArea label="What was said" value={f.excerpt} onChange={set('excerpt')} required rows={3} />
      <TextField label="Who posted it (handle)" value={f.authorHandle} onChange={set('authorHandle')} />
      <SelectField label="Sentiment (your judgement)" value={f.sentiment} onChange={set('sentiment')} options={['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'].map((x) => ({ value: x, label: x.toLowerCase() }))} />
    </FormModal>
  );
}

function CompetitorForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', platform: 'INSTAGRAM', handle: '', url: '', website: '', industry: '', notes: '' });
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const n = (v: string) => v.trim() || null;
  return (
    <FormModal title="Track a competitor" onClose={onClose} submitLabel="Track" disabled={f.name.trim().length < 2 || !f.handle.trim()}
      onSubmit={async () => { await sendJson('POST', '/smois/competitors', { ...f, url: n(f.url), website: n(f.website), industry: n(f.industry), notes: n(f.notes) }); onDone(); }}>
      <TextField label="Name" value={f.name} onChange={set('name')} required />
      <SelectField label="Platform" value={f.platform} onChange={set('platform')} options={Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value, label }))} />
      <TextField label="Handle" value={f.handle} onChange={set('handle')} required />
      <TextField label="Profile URL" type="url" value={f.url} onChange={set('url')} />
      <TextField label="Website" type="url" value={f.website} onChange={set('website')} />
      <TextField label="Industry" value={f.industry} onChange={set('industry')} />
    </FormModal>
  );
}

function ReadingForm({ c, onClose, onDone }: { c: Competitor; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ date: todayIso(), followers: '', postsLastWeek: '', avgEngagement: '', basis: 'PUBLIC_OBSERVATION' });
  const set = (k: keyof typeof v) => (x: string) => setV({ ...v, [k]: x });
  return (
    <FormModal title={`Reading for ${c.name}`} onClose={onClose} submitLabel="Save" disabled={!v.followers && !v.postsLastWeek && !v.avgEngagement}
      onSubmit={async () => {
        await sendJson('POST', `/smois/competitors/${c.id}/readings`, { date: v.date, basis: v.basis, followers: toInt(v.followers), postsLastWeek: toInt(v.postsLastWeek), avgEngagement: toInt(v.avgEngagement) });
        onDone();
      }}>
      <TextField label="Date observed" type="date" value={v.date} max={todayIso()} onChange={set('date')} required />
      <NumField label="Public followers" value={v.followers} onChange={set('followers')} />
      <NumField label="Posts in the last week" value={v.postsLastWeek} onChange={set('postsLastWeek')} />
      <NumField label="Average engagement per post" value={v.avgEngagement} onChange={set('avgEngagement')} />
      <SelectField label="Where it comes from" value={v.basis} onChange={set('basis')} options={[{ value: 'PUBLIC_OBSERVATION', label: 'Seen on their public profile' }, { value: 'ESTIMATE', label: 'Our estimate' }, { value: 'THIRD_PARTY', label: 'Third-party tool' }]} />
    </FormModal>
  );
}
