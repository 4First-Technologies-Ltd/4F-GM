import { AppState } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './api';
import { getAccessToken } from './storage';

/**
 * Lightweight usage tracking → POST /api/events.
 *
 * - Fire-and-forget: tracking can never throw into, block, or slow the app.
 * - Batched (every 15s, at 10 queued events, and when the app backgrounds) and
 *   kept in memory only — a killed app loses at most a few seconds of events,
 *   which is the right trade against writing to disk on every screen change.
 * - Carries no personal data: an install id, a per-launch session id, event
 *   names and screen route patterns (never URLs with ids in them). Who the user
 *   is comes from the access token, attached here and verified by the server.
 */

const ANON_KEY = '4fg_anon_id';
const FLUSH_EVERY_MS = 15_000;
const FLUSH_AT = 10;
const MAX_QUEUE = 100;
const MAX_PER_REQUEST = 25;

interface QueuedEvent {
  name: string;
  screen?: string;
  properties?: Record<string, unknown>;
  occurredAt: string;
}

const randomId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;

const sessionId = randomId();
let anonymousId: string | null = null;
let queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let flushing = false;
let started = false;

async function getAnonymousId(): Promise<string> {
  if (anonymousId) return anonymousId;
  try {
    const stored = await SecureStore.getItemAsync(ANON_KEY);
    if (stored) {
      anonymousId = stored;
      return stored;
    }
    const fresh = randomId();
    await SecureStore.setItemAsync(ANON_KEY, fresh);
    anonymousId = fresh;
    return fresh;
  } catch {
    anonymousId = randomId(); // storage unavailable: still usable for this launch
    return anonymousId;
  }
}

export async function flushEvents(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, MAX_PER_REQUEST);
  try {
    const token = await getAccessToken().catch(() => null);
    const res = await fetch(`${API_BASE_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        platform: 'MOBILE',
        anonymousId: await getAnonymousId(),
        sessionId,
        appVersion: Constants.expoConfig?.version,
        events: batch
      })
    });
    // 4xx means the batch itself is bad: drop it rather than retry forever.
    if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      queue = queue.slice(batch.length);
    }
  } catch {
    // Offline or server down: keep the events for the next flush.
  } finally {
    flushing = false;
  }
}

function start() {
  if (started) return;
  started = true;
  timer = setInterval(() => void flushEvents(), FLUSH_EVERY_MS);
  AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') void flushEvents();
    if (state === 'active') track('app_opened');
  });
}

export function track(name: string, properties?: Record<string, unknown>, screen?: string): void {
  try {
    start();
    if (queue.length >= MAX_QUEUE) queue.shift();
    queue.push({ name, screen, properties, occurredAt: new Date().toISOString() });
    if (queue.length >= FLUSH_AT) void flushEvents();
  } catch {
    // tracking must never break the app
  }
}

export function trackScreen(routePattern: string): void {
  track('screen_viewed', undefined, routePattern.slice(0, 100));
}

/** Stop the timer (tests / teardown). */
export function stopTracking(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
