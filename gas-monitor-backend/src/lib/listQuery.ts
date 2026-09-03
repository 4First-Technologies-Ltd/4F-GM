import type { Request } from 'express';

/**
 * Shared list-query parsing for the admin API.
 *
 * Every admin list endpoint accepts the same contract so the dashboard can drive
 * them all through one engine:
 *
 *   ?page=1&limit=20&q=hello&sort=createdAt&dir=desc&<filters>
 *
 * and every one responds with:
 *
 *   { data: T[], pagination: { total, page, limit, pages } }
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface ListQuery {
  page: number;
  limit: number;
  skip: number;
  take: number;
  q?: string;
  sort?: string;
  dir: 'asc' | 'desc';
}

export function parseListQuery(req: Request): ListQuery {
  const rawPage = Number(req.query.page);
  const rawLimit = Number(req.query.limit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  // Clamped: an unbounded ?limit is a trivial way to pull the whole table.
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), MAX_LIMIT) : DEFAULT_LIMIT;

  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : undefined;
  const sort = typeof req.query.sort === 'string' && req.query.sort ? req.query.sort : undefined;
  const dir = req.query.dir === 'asc' ? 'asc' : 'desc';

  return { page, limit, skip: (page - 1) * limit, take: limit, q, sort, dir };
}

/**
 * Build a Prisma `orderBy` from untrusted input.
 *
 * `allowed` is a whitelist — an arbitrary `?sort=` string must never reach
 * Prisma, both because it errors on unknown fields and because it leaks the
 * shape of the model through the error message.
 */
export function orderBy<T extends string>(
  query: ListQuery,
  allowed: readonly T[],
  fallback: T
): Record<string, 'asc' | 'desc'> {
  const field = query.sort && (allowed as readonly string[]).includes(query.sort) ? query.sort : fallback;
  return { [field]: query.dir };
}

export function paginated<T>(data: T[], total: number, query: ListQuery) {
  return {
    data,
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.max(1, Math.ceil(total / query.limit))
    }
  };
}
