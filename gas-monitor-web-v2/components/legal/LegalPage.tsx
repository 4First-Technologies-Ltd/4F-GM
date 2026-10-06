import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LegalDoc } from "@/lib/legal";
import { LegalDocument } from "./LegalDocument";

/** Public /terms and /privacy page: contents list beside the document. */
export function LegalPage({ doc, other }: { doc: LegalDoc; other: LegalDoc }) {
  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-36 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav
            aria-label={`${doc.title} contents`}
            className="sticky top-28 rounded-2xl border border-border bg-card/80 p-5 backdrop-blur"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Contents
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {doc.sections.map((s, i) => (
                <li key={s.id}>
                  <a
                    href={`#${doc.slug}-${s.id}`}
                    className="flex gap-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="font-mono text-xs text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div>
          <div className="rounded-2xl border border-border bg-card px-6 py-10 shadow-sm sm:px-12">
            <LegalDocument doc={doc} />
          </div>
          <Link
            href={`/${other.slug}`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80"
          >
            Also read: {other.title}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </main>
  );
}
