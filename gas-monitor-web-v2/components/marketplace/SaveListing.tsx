"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/motion/button/base";
import { useAuth } from "@/lib/auth-context";
import { savedApi } from "@/lib/api";

/**
 * Save control on a listing.
 *  - Signed out: "Sign in to save".
 *  - Signed in: "Save & continue shopping" saves the listing, then goes back to the
 *    marketplace. Once saved it reads "Saved · Continue shopping" with a way to undo.
 * It renders nothing while the session loads, so a signed-in visitor never sees the
 * sign-in prompt flash up.
 */
export function SaveListing({ listingId }: { listingId: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [saved, setSaved] = useState<boolean | null>(null); // null = not known yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    savedApi
      .ids()
      .then((ids) => {
        if (!cancelled) setSaved(ids.includes(listingId));
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, listingId]);

  if (loading) return null;
  if (!user) {
    return (
      <ButtonLink href="/sign-in" variant="outline" size="lg">
        Sign in to save
      </ButtonLink>
    );
  }

  async function saveAndContinue() {
    setBusy(true);
    setError(null);
    try {
      if (!saved) await savedApi.save(listingId);
      setSaved(true);
      router.push("/marketplace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this item.");
    } finally {
      setBusy(false);
    }
  }

  async function unsave() {
    setBusy(true);
    setError(null);
    try {
      await savedApi.remove(listingId);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="lg" onClick={saveAndContinue} disabled={busy || saved === null}>
        {busy ? "Saving…" : saved ? "Saved · Continue shopping" : "Save & continue shopping"}
      </Button>
      {saved && (
        <button
          type="button"
          onClick={unsave}
          disabled={busy}
          className="self-center text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
        >
          Remove from saved
        </button>
      )}
      {error && (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
