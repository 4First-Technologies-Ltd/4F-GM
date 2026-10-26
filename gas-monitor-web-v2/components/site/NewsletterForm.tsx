"use client";

import { useState } from "react";
import { Input } from "@/components/motion/input";
import { Button } from "@/components/motion/button/base";
import { apiUrl } from "@/lib/api";

type Status = "idle" | "sending" | "sent" | "error";

export function NewsletterForm({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, hidden from people
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/newsletter/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong. Please try again.");
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  if (status === "sent") {
    return (
      <div className={className} role="status">
        <p className="text-lg font-semibold">Check your inbox.</p>
        <p className="mt-2 text-muted-foreground">
          We sent a confirmation link to <strong>{email}</strong>. Open it to start
          getting the newsletter. If nothing arrives in a few minutes, check spam.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={className} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            type="email"
            aria-label="Email address"
            placeholder="you@example.com"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            error={email.length > 0 && !emailValid}
          />
        </div>
        {/* Bots fill every field; people never see this one. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        {/* h-11 matches the input so the two sit on one line. */}
        <Button
          type="submit"
          size="lg"
          className="h-11"
          disabled={!emailValid || status === "sending"}
        >
          {status === "sending" ? "Subscribing…" : "Subscribe"}
        </Button>
      </div>
      {email.length > 0 && !emailValid ? (
        <p className="mt-2 text-sm text-destructive">Enter a valid email</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      <p className="mt-2 text-xs text-muted-foreground">
        We email you once to confirm. Unsubscribe from any issue with one click.
      </p>
    </form>
  );
}
