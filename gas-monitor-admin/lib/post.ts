import { adminFetch } from './api';

/**
 * JSON request to /api/admin that throws the server's own message on failure.
 * The resource engine's data source covers list/get/patch; the action
 * endpoints (retry, cancel, reply…) are POST/PUT/DELETE with bespoke bodies.
 */
export async function sendJson<T = unknown>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const res = await adminFetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}
