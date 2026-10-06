import { LEGAL_EFFECTIVE_DATE, LEGAL_VERSION, type LegalDoc } from "@/lib/legal";

/**
 * A legal document laid out like a printed page: title block, numbered
 * sections, body copy. Pure presentation — used both by the public /terms and
 * /privacy pages and inside the gated reader at sign-up.
 */
export function LegalDocument({
  doc,
  headingId,
}: {
  doc: LegalDoc;
  /** id for the title, so a surrounding dialog can reference it. */
  headingId?: string;
}) {
  return (
    <article className="text-[15px] leading-7 text-foreground">
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
          4FG Smart Gas Monitor
        </p>
        <h1
          id={headingId}
          className="mt-2 text-3xl font-bold tracking-tight text-foreground"
        >
          {doc.title}
        </h1>
        <p className="mt-3 text-muted-foreground">{doc.summary}</p>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-1.5">
            <dt className="font-medium text-foreground">Effective</dt>
            <dd>{LEGAL_EFFECTIVE_DATE}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="font-medium text-foreground">Version</dt>
            <dd className="font-mono">{LEGAL_VERSION}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-8 space-y-9">
        {doc.sections.map((section, i) => (
          <section
            key={section.id}
            id={`${doc.slug}-${section.id}`}
            aria-labelledby={`${doc.slug}-${section.id}-h`}
            className="scroll-mt-28"
          >
            <h2
              id={`${doc.slug}-${section.id}-h`}
              className="flex items-baseline gap-3 text-lg font-semibold text-foreground"
            >
              <span className="font-mono text-sm text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              {section.heading}
            </h2>
            <div className="mt-3 space-y-3 text-muted-foreground">
              {section.body.map((block, j) =>
                typeof block === "string" ? (
                  <p key={j}>{block}</p>
                ) : (
                  <ul
                    key={j}
                    className="list-disc space-y-1.5 pl-5 marker:text-primary/60"
                  >
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-12 border-t border-border pt-6 text-center text-xs uppercase tracking-[0.14em] text-muted-foreground">
        End of {doc.title.toLowerCase()}
      </p>
    </article>
  );
}
