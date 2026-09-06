"use client";

import { useCallback, useState } from "react";
import { ArrowRight, Handshake, Store } from "lucide-react";
import {
  Button,
  ButtonLink,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/motion/button/base";
import { Modal } from "@/components/motion/modal";

/**
 * "Apply to sell" asks which kind of partner you are before sending you on:
 * distributors need a conversation, service vendors can just sign up.
 */
export function VendorPathModal({
  label = "Apply to sell",
  variant = "primary",
  size = "lg",
  className,
}: {
  /** Trigger button copy — the dialog itself is the same either way. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {label}
        <ArrowRight className="h-4 w-4" />
      </Button>

      <Modal
        open={open}
        onClose={close}
        labelledBy="vendor-path-title"
        className="max-w-lg"
      >
        <h2 id="vendor-path-title" className="pr-8 text-lg font-semibold">
          How do you want to work with 4FG?
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pick the option that describes your business.
        </p>

        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border/70 p-5">
            <div className="flex items-center gap-2.5">
              <Handshake className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="text-sm font-semibold">Become a distributor</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              If you wish to become a distributor for 4FG-Monitor, contact us
              and we&apos;ll take it from there.
            </p>
            <ButtonLink
              href="/contact"
              variant="outline"
              size="md"
              className="mt-4"
              onClick={close}
            >
              Contact us
            </ButtonLink>
          </div>

          <div className="rounded-xl border border-primary/50 bg-primary/[0.06] p-5">
            <div className="flex items-center gap-2.5">
              <Store className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="text-sm font-semibold">Sell on the marketplace</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign up here if you simply want to sell your services through our
              platform.
            </p>
            <ButtonLink
              href="/sign-up?role=vendor"
              size="md"
              className="mt-4"
              onClick={close}
            >
              Sign up
            </ButtonLink>
          </div>
        </div>
      </Modal>
    </>
  );
}
