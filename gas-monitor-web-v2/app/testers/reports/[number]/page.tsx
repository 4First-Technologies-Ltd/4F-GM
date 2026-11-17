'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { SEVERITY_LABEL, testersApi, type BugDetailResponse } from '@/lib/testers';
import { TesterShell, StatusPill, inputCls, primaryBtn, relativeTime, secondaryBtn } from '@/components/testers/shell';

export default function ReportPage() {
  return (
    <Suspense fallback={null}>
      <TesterShell title="Report" back={{ href: '/testers/reports', label: 'My reports' }}>
        {() => <Report />}
      </TesterShell>
    </Suspense>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{children}</p>
  </div>
);

function Report() {
  const { number } = useParams<{ number: string }>();
  const filed = useSearchParams().get('filed') === '1';
  const router = useRouter();

  const [data, setData] = useState<BugDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [retestNote, setRetestNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    testersApi
      .get(number)
      .then(setData)
      .catch((e) => {
        if (e?.status === 401) router.replace('/testers');
        else setError(e instanceof Error ? e.message : 'Could not load this report.');
      });
  }, [number, router]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { bug, attachments, comments } = data;
  const device = [bug.deviceModel, bug.androidVersion && `Android ${bug.androidVersion}`, bug.appVersion && `app ${bug.appVersion}`, bug.network].filter(Boolean).join(' · ');

  return (
    <div className="grid gap-5">
      {filed && (
        <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
          Thank you, report #{bug.number} is with the team. We will email you if we need more information or when a fix is ready to retest.
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-foreground">
            <span className="text-muted-foreground">#{bug.number}</span> {bug.title}
          </h2>
          <StatusPill status={bug.status} />
        </div>
        <p className="text-xs text-muted-foreground">
          {SEVERITY_LABEL[bug.severity]} · {bug.area.toLowerCase()}
          {bug.screen ? ` · ${bug.screen}` : ''} · filed {relativeTime(bug.createdAt)}
          {bug.status === 'DUPLICATE' && bug.duplicateOfNumber ? ` · same problem as #${bug.duplicateOfNumber}` : ''}
        </p>
        <Field label="Steps">{bug.steps}</Field>
        <Field label="Expected">{bug.expected}</Field>
        <Field label="Actual">{bug.actual}</Field>
        {device && <Field label="Phone">{device}</Field>}

        {attachments.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {attachments.map((a) =>
                !a.url ? (
                  <span key={a.id} className="text-sm text-muted-foreground">
                    {a.fileName}
                  </span>
                ) : a.contentType.startsWith('video/') ? (
                  <video key={a.id} src={a.url} controls preload="metadata" className="w-full rounded-lg" aria-label={a.fileName} />
                ) : (
                  <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.fileName} className="w-full rounded-lg" />
                  </a>
                )
              )}
            </div>
          </div>
        )}
      </section>

      {bug.status === 'FIXED' && (
        <section className="grid gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <h2 className="text-base font-semibold text-foreground">Please retest</h2>
          <p className="text-sm text-muted-foreground">The team believes this is fixed in build {bug.fixedInBuild ?? 'the latest'}. Update the app, repeat your steps, then tell us what you see.</p>
          <textarea className={inputCls} rows={2} maxLength={2000} placeholder="Anything to add? (optional)" value={retestNote} onChange={(e) => setRetestNote(e.target.value)} aria-label="Retest note" />
          <div className="flex flex-wrap gap-3">
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => run(() => testersApi.retest(bug.number, true, retestNote.trim() || undefined))}>
              It’s fixed
            </button>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => run(() => testersApi.retest(bug.number, false, retestNote.trim() || undefined))}>
              Still happens
            </button>
          </div>
        </section>
      )}

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Conversation</h2>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ul className="grid gap-3">
            {comments.map((c) => (
              <li key={c.id} className={`rounded-lg border border-border p-3 ${c.author === 'ADMIN' ? 'bg-primary/5' : ''}`}>
                <p className="flex justify-between gap-3 text-xs text-muted-foreground">
                  <span>{c.author === 'ADMIN' ? `${c.authorName} (4FG team)` : 'You'}</span>
                  <span>{relativeTime(c.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{c.body}</p>
              </li>
            ))}
          </ul>
        )}

        {bug.status !== 'VERIFIED' && (
          <div className="grid gap-3">
            <textarea className={inputCls} rows={3} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={bug.status === 'NEEDS_INFO' ? 'Answer the team’s question…' : 'Add more detail…'} aria-label="Message" />
            <div className="flex justify-end">
              <button
                type="button"
                className={primaryBtn}
                disabled={busy || !comment.trim()}
                onClick={() =>
                  run(async () => {
                    await testersApi.comment(bug.number, comment.trim());
                    setComment('');
                  })
                }
              >
                Send
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
