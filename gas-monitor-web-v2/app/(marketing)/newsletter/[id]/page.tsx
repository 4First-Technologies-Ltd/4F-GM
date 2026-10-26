import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { apiUrl } from "@/lib/api";

export const revalidate = 300;

interface Issue {
  id: string;
  subject: string;
  body: string;
  sentAt: string | null;
}

async function getIssue(id: string): Promise<Issue | null> {
  try {
    const res = await fetch(apiUrl(`/api/newsletter/issues/${encodeURIComponent(id)}`), {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()).issue ?? null;
  } catch {
    return null;
  }
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssue((await params).id);
  return { title: issue ? issue.subject : "Newsletter" };
}

export default async function NewsletterIssuePage({ params }: Props) {
  const issue = await getIssue((await params).id);
  if (!issue) notFound();

  // Same rule as the email: a blank line starts a new paragraph. Rendered as text, never HTML.
  const paragraphs = issue.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const date = issue.sentAt
    ? new Date(issue.sentAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-36 sm:px-6">
      <Link href="/newsletter" className="text-sm text-muted-foreground hover:text-foreground">
        ← All issues
      </Link>
      <p className="mt-8 text-xs text-muted-foreground">{date}</p>
      <h1 className="mt-2 text-3xl font-semibold">{issue.subject}</h1>
      <div className="mt-8 space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-line leading-relaxed text-foreground/90">
            {p}
          </p>
        ))}
      </div>

      <section className="mt-16 border-t border-border pt-10">
        <h2 className="text-lg font-semibold">Get the next issue by email</h2>
        <NewsletterForm className="relative mt-4" />
      </section>
    </main>
  );
}
