'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SEVERITY_LABEL, testersApi, type MyBug } from '@/lib/testers';
import { TesterShell, StatusPill, primaryBtn, relativeTime } from '@/components/testers/shell';
import { useRouter } from 'next/navigation';

export default function MyReportsPage() {
  return (
    <TesterShell title="My reports">{(session) => <Reports name={session.tester.name} />}</TesterShell>
  );
}

function Reports({ name }: { name: string }) {
  const router = useRouter();
  const [bugs, setBugs] = useState<MyBug[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    testersApi
      .list()
      .then((r) => setBugs(r.bugs))
      .catch((e) => {
        // A 401 clears the session; the shell then sends them to sign in.
        if (e?.status === 401) router.replace('/testers');
        else setError(e instanceof Error ? e.message : 'Could not load your reports.');
      });
  }, [router]);

  if (error) return <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>;
  if (!bugs) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const retest = bugs.filter((b) => b.status === 'FIXED');
  const needInfo = bugs.filter((b) => b.status === 'NEEDS_INFO');

  return (
    <div className="grid gap-5">
      {(retest.length > 0 || needInfo.length > 0) && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
          <p className="font-medium">Waiting on you</p>
          <ul className="mt-2 grid gap-1">
            {needInfo.map((b) => (
              <li key={b.number}>
                <Link className="underline" href={`/testers/reports/${b.number}`}>
                  #{b.number}
                </Link>{' '}
                needs more information from you.
              </li>
            ))}
            {retest.map((b) => (
              <li key={b.number}>
                <Link className="underline" href={`/testers/reports/${b.number}`}>
                  #{b.number}
                </Link>{' '}
                is fixed in build {b.fixedInBuild ?? 'the latest'}. Please retest.
              </li>
            ))}
          </ul>
        </div>
      )}

      {bugs.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
          <p className="text-foreground">Hi {name}, you have not reported anything yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Found something wrong? Tell us what happened and we will take it from there.</p>
          <Link href="/testers/report" className={`${primaryBtn} mt-5`}>
            Report a bug
          </Link>
        </div>
      ) : (
        <ul className="grid gap-3">
          {bugs.map((b) => (
            <li key={b.number}>
              <Link href={`/testers/reports/${b.number}`} className="block rounded-2xl bg-card p-4 shadow-sm transition-colors hover:bg-muted">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words font-medium text-foreground">
                    <span className="text-muted-foreground">#{b.number}</span> {b.title}
                  </p>
                  <StatusPill status={b.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {SEVERITY_LABEL[b.severity]} · {b.area.toLowerCase()} · updated {relativeTime(b.updatedAt)}
                  {b.status === 'DUPLICATE' && b.duplicateOfNumber ? ` · same as #${b.duplicateOfNumber}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
