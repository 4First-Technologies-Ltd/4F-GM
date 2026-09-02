"use client";

import { useState } from "react";
import { Input } from "@/components/motion/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/motion/select";
import { Checkbox } from "@/components/motion/checkbox";
import { Button } from "@/components/motion/button/base";
type Status = "idle" | "sending" | "sent" | "error";

const TOPICS = [
  { value: "general", label: "General enquiry" },
  { value: "support", label: "Device support" },
  { value: "vendor", label: "Becoming a vendor" },
  { value: "press", label: "Press" },
];

const CONTACT_INFO = {
  address: "Head Office: Imo Digital City Limited, 23 Egbu Road, Owerri, Imo State, Nigeria.",
  phone: "+234 906 476 8335",
  email: "4fg@4firsttechnologies.com",
  supportEmail: "4fg-support@4firsttechnologies.com",
  hours: "Monday – Friday: 8:00am – 6:00pm\nSaturday: 9:00am – 3:00pm\nSunday: Closed",
};

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit =
    name.trim().length > 1 && emailValid && message.trim().length > 4 && consent;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || status === "sending") return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "sent") {
    return (
      <main className="mx-auto max-w-xl px-6 pb-24 pt-40 text-center">
        <h1 className="text-3xl font-semibold">Thanks — we&apos;ve got it.</h1>
        <p className="mt-4 text-muted-foreground">
          We reply to most messages within one business day.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-36 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.28em] text-primary">
        Contact
      </p>
      <h1 className="mt-4 text-4xl font-semibold">Talk to a human.</h1>
      <p className="mt-4 text-muted-foreground">
        Questions about the device, the marketplace, or selling on 4FG — send
        them here.
      </p>

      <div className="mt-4 grid gap-16 lg:grid-cols-2 lg:items-start">
        <div className="space-y-8 lg:order-1">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest">
              Address
            </h3>
            <p className="mt-3 text-base text-muted-foreground">
              {CONTACT_INFO.address}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest">
              Phone
            </h3>
            <a
              href={`tel:${CONTACT_INFO.phone}`}
              className="mt-3 block text-base text-primary transition-colors hover:text-primary/80"
            >
              {CONTACT_INFO.phone}
            </a>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest">
              Email
            </h3>
            <div className="mt-3 space-y-2">
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="block text-base text-primary transition-colors hover:text-primary/80"
              >
                {CONTACT_INFO.email}
              </a>
              <a
                href={`mailto:${CONTACT_INFO.supportEmail}`}
                className="block text-base text-primary transition-colors hover:text-primary/80"
              >
                {CONTACT_INFO.supportEmail}
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest">
              Operating Hours
            </h3>
            <p className="mt-3 whitespace-pre-line text-base text-muted-foreground">
              {CONTACT_INFO.hours}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 lg:order-2 lg:-mt-24">
        <Input
          label="Your name"
          value={name}
          onChange={setName}
          autoComplete="name"
          reserveErrorLine
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          error={email.length > 0 && !emailValid ? "Enter a valid email" : false}
          reserveErrorLine
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium">Topic</label>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a topic" />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-lg border border-input bg-card/60 px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <Checkbox
            checked={consent}
            onCheckedChange={setConsent}
            label="I agree to be contacted about this enquiry."
          />
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || status === "sending"}
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
        </form>
      </div>
    </main>
  );
}
