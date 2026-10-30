import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL } from './api';

// The version gate. The API says the oldest version still allowed and the newest
// one out; this phone compares against the version baked into its own build.
export interface VersionPolicy {
  min: string;
  latest: string;
  storeUrl: string | null;
  /** "What's new" text from the admin Settings page; null/absent from older servers. */
  notes?: string | null;
}

export interface UpdateNotes {
  summary: string;
  points: string[];
}

// Used when the admin hasn't written notes for this release.
const DEFAULT_NOTES: UpdateNotes = {
  summary: 'This update makes 4FG Monitor faster, smoother and more reliable for you.',
  points: [
    'Faster start-up and smoother screens, so you get to your gas orders sooner.',
    'Orders, payments and tracking load quicker, even on a slow connection.',
    'Fewer crashes and errors when ordering or paying.',
    'The latest security improvements keep your account and payments safe.',
    'Bug fixes and small improvements throughout the app.'
  ]
};

/**
 * First line is the short summary; every other line is a point (a leading "-", "*" or "•"
 * is dropped). Empty notes fall back to the built-in wording.
 */
export function parseUpdateNotes(notes?: string | null): UpdateNotes {
  const lines = (notes ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return DEFAULT_NOTES;
  return { summary: lines[0], points: lines.slice(1) };
}

export type UpdateState = 'ok' | 'available' | 'required';

export const installedVersion = Constants.expoConfig?.version ?? '0.0.0';

// x.y.z by number, so 1.10.0 is newer than 1.9.0. Missing or non-numeric parts count as 0.
const parts = (v: string) => v.split('.').map((p) => Number.parseInt(p, 10) || 0);

export function isOlder(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

export function updateState(policy: VersionPolicy, installed = installedVersion): UpdateState {
  if (isOlder(installed, policy.min)) return 'required';
  if (isOlder(installed, policy.latest)) return 'available';
  return 'ok';
}

export async function fetchVersionPolicy(): Promise<VersionPolicy> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const res = await fetch(`${API_BASE_URL}/api/app-version?platform=${platform}`);
  if (!res.ok) throw new Error(`app-version ${res.status}`);
  return (await res.json()) as VersionPolicy;
}
