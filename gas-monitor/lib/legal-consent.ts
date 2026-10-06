import { useSyncExternalStore } from 'react';
import type { LegalDoc } from './legal';

type Slug = LegalDoc['slug'];

// In-memory only: consent is collected per sign-up attempt, never persisted locally.
let accepted: Record<Slug, boolean> = { terms: false, privacy: false };
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function setLegalAccepted(slug: Slug, value: boolean) {
  accepted = { ...accepted, [slug]: value };
  listeners.forEach((l) => l());
}

export function useLegalConsent() {
  const state = useSyncExternalStore(subscribe, () => accepted, () => accepted);
  return { ...state, all: state.terms && state.privacy };
}
