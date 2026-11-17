'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearTesterSession, getTesterSession, type BugStatus, type TesterSession, STATUS_LABEL } from '@/lib/testers';
import { LogoEmblem } from '@/components/site/Logo';

export const inputCls =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
export const labelCls = 'mb-1.5 block text-sm font-medium text-foreground';
export const helpCls = 'mt-1 text-xs text-muted-foreground';
export const primaryBtn =
  'inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryBtn =
  'inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed';

const TONE: Record<BugStatus, string> = {
  NEW: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  NEEDS_INFO: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  CONFIRMED: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  IN_PROGRESS: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  FIXED: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
  VERIFIED: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
  WONT_FIX: 'bg-muted text-muted-foreground',
  DUPLICATE: 'bg-muted text-muted-foreground'
};

export function StatusPill({ status }: { status: BugStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Page frame for a signed-in tester. Sends anyone without a session to the sign-in page. */
export function TesterShell({
  children,
  title,
  back
}: {
  children: (session: TesterSession) => React.ReactNode;
  title: string;
  back?: { href: string; label: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<TesterSession | null | undefined>(undefined);

  useEffect(() => {
    const s = getTesterSession();
    setSession(s);
    if (!s) router.replace('/testers');
  }, [router, pathname]);

  if (!session) return <main className="min-h-dvh bg-background" aria-busy="true" />;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/testers/reports" className="flex items-center gap-2">
            <LogoEmblem size={32} />
            <span className="text-sm font-semibold text-foreground">4FG bug tracker</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/testers/reports" className="text-muted-foreground hover:text-foreground">
              My reports
            </Link>
            <Link href="/testers/report" className={primaryBtn}>
              Report a bug
            </Link>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                clearTesterSession();
                router.replace('/testers');
              }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {back && (
          <Link href={back.href} className="mb-3 inline-block text-sm text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        )}
        <h1 className="mb-5 text-2xl font-bold text-foreground">{title}</h1>
        {children(session)}
      </main>
    </div>
  );
}
