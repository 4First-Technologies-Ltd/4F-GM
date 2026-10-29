/**
 * CAC registration number. Mirrors the server's loose check (`RC` prefix optional,
 * 4–10 digits); the server normalises it to `RC1234567` and is the authority.
 */
export function isValidRcNumber(value: string): boolean {
  return /^(rc[\s-]*)?\d[\d\s-]{2,}\d$/i.test(value.trim()) && /^\d{4,10}$/.test(value.trim().replace(/^rc[\s-]*/i, '').replace(/[\s-]/g, ''));
}

export const RC_NUMBER_HINT = 'Your CAC registration number, e.g. RC1234567. We use it to verify your business.';
