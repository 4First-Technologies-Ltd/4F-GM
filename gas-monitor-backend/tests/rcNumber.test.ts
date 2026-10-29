import { describe, expect, it } from 'vitest';
import { normalizeRcNumber, rcNumberSchema } from '../src/lib/rcNumber';

describe('normalizeRcNumber', () => {
  it.each(['RC1234567', 'rc 1234567', 'RC-1234567', ' 1234567 ', 'Rc 123 4567'])('accepts %j', (raw) => {
    expect(normalizeRcNumber(raw)).toBe('RC1234567');
  });

  it.each(['', 'RC', 'ABC123', '12', 'BN1234567', '123456789012'])('rejects %j', (raw) => {
    expect(normalizeRcNumber(raw)).toBeNull();
  });

  it('works as a zod schema', () => {
    expect(rcNumberSchema.parse('rc 99887')).toBe('RC99887');
    expect(rcNumberSchema.safeParse('nope').success).toBe(false);
  });
});
