// The API lives in the standalone gas-monitor-backend service (Express + Prisma),
// mounted under /api/admin/*. Set NEXT_PUBLIC_API_URL to its origin; defaults to
// the local dev backend (port 9000).
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:9000';

// Admin auth is a cross-origin httpOnly cookie session, so every request needs
// credentials included. Use this instead of a bare fetch() for any /api/admin/* call.
export function adminFetch(path: string, init: RequestInit = {}) {
  return fetch(`${API_BASE_URL}/api/admin${path}`, {
    ...init,
    credentials: 'include'
  });
}
