"use client";

import { useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legal";
import { LegalReader } from "./LegalReader";

type DocKey = "terms" | "privacy";

const DOCS: Record<DocKey, LegalDoc> = { terms: TERMS, privacy: PRIVACY };

/**
 * Sign-up consent. Replaces a bare "I agree" checkbox: each document has to be
 * opened and scrolled to the end before it can be accepted.
 */
export function LegalConsent({
  termsAccepted,
  privacyAccepted,
  onTermsChange,
  onPrivacyChange,
  invalid,
  disabled,
}: {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  onTermsChange: (accepted: boolean) => void;
  onPrivacyChange: (accepted: boolean) => void;
  /** Highlight the control after a submit attempt without both accepted. */
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState<DocKey | null>(null);

  const accepted: Record<DocKey, boolean> = {
    terms: termsAccepted,
    privacy: privacyAccepted,
  };

  function handleAccept(key: DocKey) {
    if (key === "terms") {
      onTermsChange(true);
      // Walk the user straight on to the policy they still have to read.
      setOpen(privacyAccepted ? null : "privacy");
    } else {
      onPrivacyChange(true);
      setOpen(null);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">
        Terms and privacy
      </p>
      <ul
        className={`divide-y divide-border overflow-hidden rounded-xl border ${
          invalid ? "border-destructive/60" : "border-border"
        }`}
      >
        {(Object.keys(DOCS) as DocKey[]).map((key) => {
          const doc = DOCS[key];
          const done = accepted[key];
          return (
            <li
              key={key}
              className="flex items-center gap-3 bg-card px-4 py-3"
            >
              <span
                className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg ${
                  done
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FileText className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">
                  {doc.title}
                </span>
                <span
                  className={`block text-xs ${
                    done ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {done ? "Read and accepted" : "Read to the end to accept"}
                </span>
              </span>
              <Button
                type="button"
                variant={done ? "ghost" : "outline"}
                size="sm"
                disabled={disabled}
                onClick={() => setOpen(key)}
              >
                {done ? "Read again" : "Read and accept"}
              </Button>
            </li>
          );
        })}
      </ul>

      {(Object.keys(DOCS) as DocKey[]).map((key) => (
        <LegalReader
          key={key}
          doc={DOCS[key]}
          open={open === key}
          alreadyAccepted={accepted[key]}
          acceptLabel={
            key === "terms" && !privacyAccepted
              ? "Accept and continue to Privacy Policy"
              : "I have read and accept"
          }
          onAccept={() => handleAccept(key)}
          onClose={() => setOpen(null)}
        />
      ))}
    </div>
  );
}
