import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.ADMIN_JWT_SECRET = 'test-secret';
  process.env.R2_ACCOUNT_ID = 'acct';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_BUCKET = 'docs';
});

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 test vectors', async () => {
    const { base32Encode, codeAt } = await import('../src/lib/totp');
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(codeAt(secret, 1)).toBe('287082'); // T = 59
    expect(codeAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });

  it('accepts one step of drift and refuses replay', async () => {
    const { base32Encode, codeAt, currentStep, verifyTotp } = await import('../src/lib/totp');
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = Date.now();
    const step = currentStep(now);
    expect(verifyTotp(secret, codeAt(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, codeAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, '000000', null, now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', null, now)).toBeNull();
  });

  it('round-trips and authenticates the stored secret', async () => {
    const { decryptSecret, encryptSecret } = await import('../src/lib/totp');
    const stored = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(stored).not.toContain('JBSWY3DP');
    expect(decryptSecret(stored)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, ct] = stored.split('.');
    expect(() => decryptSecret([iv, tag, Buffer.from('x').toString('base64') + ct.slice(1)].join('.'))).toThrow();
  });

  it('hashes recovery codes regardless of case or dash', async () => {
    const { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } = await import('../src/lib/totp');
    const { plain, hashes } = generateRecoveryCodes();
    expect(plain).toHaveLength(8);
    expect(hashes).toContain(hashRecoveryCode(plain[0].toUpperCase().replace('-', '')));
    expect(looksLikeRecoveryCode(plain[0])).toBe(true);
    expect(looksLikeRecoveryCode('123456')).toBe(false);
  });
});

describe('admin session tokens', () => {
  it('does not accept an MFA challenge as a session, or the reverse', async () => {
    const { signMfaChallenge, verifyAdminSession, signAdminSession, verifyMfaChallenge } = await import('../src/lib/adminJwt');
    expect(() => verifyAdminSession(signMfaChallenge({ adminId: 'a1', tv: 0 }))).toThrow();
    expect(() => verifyMfaChallenge(signAdminSession({ adminId: 'a1', username: 'u', name: 'n', role: 'SUPPORT' }))).toThrow();
    expect(verifyMfaChallenge(signMfaChallenge({ adminId: 'a1', tv: 2 })).adminId).toBe('a1');
  });
});

describe('document storage', () => {
  it('namespaces keys per vendor and only for allowed types', async () => {
    const { ALLOWED_DOC_TYPES, newDocumentKey } = await import('../src/lib/storage');
    expect(newDocumentKey('v1', 'application/pdf')).toMatch(/^vendor-docs\/v1\/[0-9a-f-]{36}\.pdf$/);
    expect(ALLOWED_DOC_TYPES['text/html']).toBeUndefined();
    expect(ALLOWED_DOC_TYPES['image/svg+xml']).toBeUndefined();
  });

  it('signs the content type and length into the upload link', async () => {
    const { presignUpload } = await import('../src/lib/storage');
    const url = new URL(await presignUpload('vendor-docs/v1/a.png', 'image/png', 1234));
    expect(url.host.endsWith('acct.r2.cloudflarestorage.com')).toBe(true);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  });

  it('gives legacy phone-local paths no link', async () => {
    const { withViewUrls } = await import('../src/lib/storage');
    const out = await withViewUrls([{ id: '1', url: 'file:///data/user/0/x.jpg' }, { id: '2', url: 'vendor-docs/v1/a.png' }]);
    expect(out[0].url).toBeNull();
    expect(out[1].url).toContain('X-Amz-Signature=');
  });
});
