'use client';

import { apiUrl } from './api';

/**
 * Client for the beta-tester bug tracker (`/api/testers`). Testers are not
 * website users: their session lives under its own storage key and never mixes
 * with the customer/vendor sign-in.
 */

const SESSION_KEY = '4fg_tester_session';
const DEVICE_KEY = '4fg_tester_device';

export interface TesterSession {
  token: string;
  tester: { id: string; name: string; email: string };
}

export type BugStatus = 'NEW' | 'NEEDS_INFO' | 'CONFIRMED' | 'IN_PROGRESS' | 'FIXED' | 'VERIFIED' | 'WONT_FIX' | 'DUPLICATE';
export type BugSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type BugFrequency = 'ALWAYS' | 'SOMETIMES' | 'ONCE';
export const BUG_AREAS = [
  { value: 'CONSUMER', label: 'Consumer' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'RIDER', label: 'Rider' },
  { value: 'COMPANY', label: 'Logistics company' },
  { value: 'MANAGER', label: 'Branch manager' },
  { value: 'GENERAL', label: 'General / sign-in / other' }
] as const;

export interface MyBug {
  number: number;
  title: string;
  area: string;
  severity: BugSeverity;
  status: BugStatus;
  fixedInBuild: string | null;
  duplicateOfNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BugDetailResponse {
  bug: MyBug & {
    id: string;
    screen: string | null;
    steps: string;
    expected: string;
    actual: string;
    frequency: BugFrequency;
    deviceModel: string | null;
    androidVersion: string | null;
    appVersion: string | null;
    network: string | null;
    accountEmail: string | null;
  };
  attachments: { id: string; fileName: string; contentType: string; size: number; url: string | null }[];
  comments: { id: string; author: 'TESTER' | 'ADMIN'; authorName: string; body: string; createdAt: string }[];
}

export const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: 'Received',
  NEEDS_INFO: 'We need more info',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'Being fixed',
  FIXED: 'Fixed: please retest',
  VERIFIED: 'Verified, thank you',
  WONT_FIX: "Won't fix",
  DUPLICATE: 'Duplicate'
};

export const SEVERITY_LABEL: Record<BugSeverity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};

// ── Session ─────────────────────────────────────────────────────────────────

export function getTesterSession(): TesterSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as TesterSession) : null;
  } catch {
    return null;
  }
}

export function saveTesterSession(session: TesterSession) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode: the session simply will not persist */
  }
}

export function clearTesterSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** The device details a tester entered last time, so every report does not start from scratch. */
export function getSavedDevice(): { deviceModel?: string; androidVersion?: string; appVersion?: string; accountEmail?: string } {
  try {
    return JSON.parse(window.localStorage.getItem(DEVICE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveDevice(device: Record<string, string | undefined>) {
  try {
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  } catch {
    /* optional convenience */
  }
}

// ── Requests ────────────────────────────────────────────────────────────────

export class TesterApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const session = auth ? getTesterSession() : null;
  const res = await fetch(apiUrl(`/api/testers${path}`), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.token}` } : {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) clearTesterSession();
  if (!res.ok) throw new TesterApiError((body as { error?: string }).error ?? `Something went wrong (${res.status})`, res.status);
  return body as T;
}

const post = <T>(path: string, data: unknown, auth = true) => call<T>(path, { method: 'POST', body: JSON.stringify(data) }, auth);

export const testersApi = {
  requestCode: (email: string) => post<{ ok: true; otp?: string }>('/login/request', { email }, false),
  verifyCode: (email: string, otp: string) => post<TesterSession>('/login/verify', { email, otp }, false),
  list: () => call<{ bugs: MyBug[] }>('/bugs'),
  get: (number: string | number) => call<BugDetailResponse>(`/bugs/${number}`),
  comment: (number: number, body: string) => post(`/bugs/${number}/comments`, { body }),
  retest: (number: number, fixed: boolean, note?: string) => post(`/bugs/${number}/retest`, { fixed, note }),
  create: (data: Record<string, unknown>) => post<{ bug: { number: number } }>('/bugs', data)
};

// ── Evidence upload ─────────────────────────────────────────────────────────

export const EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;

export interface UploadedEvidence {
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}

/** Ask for an upload link, then send the file straight to storage. */
export async function uploadEvidence(file: File): Promise<UploadedEvidence> {
  if (!EVIDENCE_TYPES.includes(file.type)) throw new Error(`"${file.name}" is not a JPG, PNG, WebP, MP4 or WebM file.`);
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error(`"${file.name}" is over 50 MB. Trim the recording and try again.`);
  const { key, uploadUrl } = await post<{ key: string; uploadUrl: string }>('/uploads/url', {
    contentType: file.type,
    size: file.size,
    fileName: file.name
  });
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!put.ok) throw new Error(`Could not upload "${file.name}". Check your connection and try again.`);
  return { key, fileName: file.name, contentType: file.type, size: file.size };
}
