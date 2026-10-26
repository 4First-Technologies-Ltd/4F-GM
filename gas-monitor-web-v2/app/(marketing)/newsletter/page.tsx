import type { Metadata } from "next";
import Link from "next/link";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { apiUrl } from "@/lib/api";

export const metadata: Metadata = {
  title: "Newsletter",
  description:
    "Product updates, gas safety tips and vendor news from 4FG Smart Gas Monitor, by email.",
};

// Re-fetched at most every 5 minutes so a newly sent issue shows up without a redeploy.
export const revalidate = 300;

interface IssueSummary {
  id: string;
  subject: string;
  excerpt: string;
  sentAt: string | null;
}

async function getIssues(): Promise<IssueSummary[]> {
  try {
    const res = await fetch(apiUrl("/api/newsletter/issues"), { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json()).issues ?? [];
  } catch {
    return [];
  }
}

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
    : "";

export default async function NewsletterPage() {
  const issues = await getIssues();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-36 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">Newsletter</p>
      <h1 className="mt-4 text-4xl font-semibold">Stay in the loop.</h1>
      <p className="mt-4 text-muted-foreground">
        Product updates, gas safety tips and vendor news, straight to your inbox.
        No spam, and you can leave any time.
      </p>

      <NewsletterForm className="relative mt-8" />

      <section className="mt-20" aria-labelledby="past-issues">
        <h2 id="past-issues" className="text-sm font-semibold uppercase tracking-widest">
          Past issues
        </h2>
        {issues.length === 0 ? (
          <p className="mt-4 text-muted-foreground">
            Our first issue is on its way. Subscribe to get it.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {issues.map((i) => (
              <li key={i.id}>
                <Link href={`/newsletter/${i.id}`} className="group block py-5">
                  <p className="text-xs text-muted-foreground">{formatDate(i.sentAt)}</p>
                  <p className="mt-1 text-lg font-semibold group-hover:text-primary">{i.subject}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{i.excerpt}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
