"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/motion/button/base";
import { Modal } from "@/components/motion/modal";
import type { LegalDoc } from "@/lib/legal";
import { LegalDocument } from "./LegalDocument";

/** How close to the bottom (px) counts as having reached the end. */
const END_TOLERANCE = 24;

/**
 * Sign-up reader. Shows the document in a dialog; the accept button stays
 * disabled until the reader has scrolled to the very end. Someone who already
 * accepted can re-read it with the button enabled from the start.
 */
export function LegalReader({
  doc,
  open,
  alreadyAccepted,
  acceptLabel = "I have read and accept",
  onAccept,
  onClose,
}: {
  doc: LegalDoc;
  open: boolean;
  alreadyAccepted: boolean;
  acceptLabel?: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  const titleId = `legal-reader-${doc.slug}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className="max-w-3xl overflow-hidden p-0"
    >
      <ReaderBody
        doc={doc}
        titleId={titleId}
        alreadyAccepted={alreadyAccepted}
        acceptLabel={acceptLabel}
        onAccept={onAccept}
        onClose={onClose}
      />
    </Modal>
  );
}

// Mounted only while the dialog is open, so scroll state resets on every open.
function ReaderBody({
  doc,
  titleId,
  alreadyAccepted,
  acceptLabel,
  onAccept,
  onClose,
}: {
  doc: LegalDoc;
  titleId: string;
  alreadyAccepted: boolean;
  acceptLabel: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(alreadyAccepted);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    // Nothing to scroll (tall screen / short document): already at the end.
    if (max <= END_TOLERANCE) {
      setProgress(1);
      setReachedEnd(true);
      return;
    }
    setProgress(Math.min(1, el.scrollTop / max));
    if (max - el.scrollTop <= END_TOLERANCE) setReachedEnd(true);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Focus the document so arrow keys / space / page-down scroll it.
    el.focus({ preventScroll: true });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const pct = Math.round(progress * 100);

  return (
    <div className="flex h-[88dvh] max-h-[52rem] flex-col">
      {/* Progress */}
      <div className="px-6 pb-3 pt-5 pr-14">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Read to continue
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${doc.title} reading progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Document */}
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label={doc.title}
        onScroll={measure}
        className="min-h-0 flex-1 overflow-y-auto border-y border-border bg-background/60 px-6 py-8 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-10"
      >
        <LegalDocument doc={doc} headingId={titleId} />
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          className="text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {reachedEnd ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-primary">
              <Check className="h-4 w-4" aria-hidden="true" />
              {alreadyAccepted
                ? "You have already accepted this."
                : "You have reached the end."}
            </span>
          ) : (
            <>Scroll to the end to enable the button ({pct}%).</>
          )}
        </p>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="md" onClick={onClose}>
            {alreadyAccepted ? "Close" : "Cancel"}
          </Button>
          {!alreadyAccepted && (
            <Button
              type="button"
              variant="primary"
              size="md"
              disabled={!reachedEnd}
              onClick={onAccept}
            >
              {acceptLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
