"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/motion/button/base";
import { apiUrl } from "@/lib/api";

type Status = "idle" | "working" | "done" | "error";

// Confirming needs a click (a POST) rather than happening on page load, so an email
// scanner that follows the link cannot subscribe someone who never asked.
function ConfirmView() {
  const token = useSearchParams().get("t") ?? "";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setStatus("working");
    try {
      const res = await fetch(apiUrl("/api/newsletter/confirm"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <>
        <h1 className="text-3xl font-semibold">You&apos;re subscribed.</h1>
        <p className="mt-4 text-muted-foreground">
          Thanks for confirming. The next issue will land in your inbox.
        </p>
        <Link href="/newsletter" className="mt-6 inline-block text-primary hover:text-primary/80">
          Read past issues
        </Link>
      </>
    );
  }

  if (!token || status === "error") {
    return (
      <>
        <h1 className="text-3xl font-semibold">This link didn&apos;t work.</h1>
        <p className="mt-4 text-muted-foreground">
          {message ?? "The confirmation link is incomplete."}
        </p>
        <Link href="/newsletter" className="mt-6 inline-block text-primary hover:text-primary/80">
          Subscribe again
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-semibold">Confirm your subscription</h1>
      <p className="mt-4 text-muted-foreground">
        One last step to start getting the 4FG newsletter.
      </p>
      <Button size="lg" className="mt-6" onClick={confirm} disabled={status === "working"}>
        {status === "working" ? "Confirming…" : "Confirm subscription"}
      </Button>
    </>
  );
}

export default function NewsletterConfirmPage() {
  return (
    <main className="mx-auto max-w-xl px-6 pb-24 pt-40 text-center">
      <Suspense>
        <ConfirmView />
      </Suspense>
    </main>
  );
}
