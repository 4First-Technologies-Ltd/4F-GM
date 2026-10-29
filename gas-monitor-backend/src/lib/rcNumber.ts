import { z } from 'zod';

/**
 * CAC registration number. Vendors type it many ways ("rc 1234567", "RC-1234567",
 * "1234567"), so it is normalised to `RC` + digits before it is stored or compared.
 */
export function normalizeRcNumber(raw: string): string | null {
  const digits = raw.trim().toUpperCase().replace(/^RC[\s-]*/, '').replace(/[\s-]/g, '');
  return /^\d{4,10}$/.test(digits) ? `RC${digits}` : null;
}

export const rcNumberSchema = z
  .string()
  .transform((v, ctx) => {
    const rc = normalizeRcNumber(v);
    if (!rc) ctx.addIssue({ code: 'custom', message: 'Enter a valid RC number, e.g. RC1234567' });
    return rc as string;
  });
