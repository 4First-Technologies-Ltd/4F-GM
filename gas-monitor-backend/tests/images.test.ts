import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
  process.env.R2_ACCOUNT_ID = 'acct';
  process.env.R2_ACCESS_KEY_ID = 'key';
  process.env.R2_SECRET_ACCESS_KEY = 'secret';
  process.env.R2_BUCKET = 'docs';
  process.env.R2_PUBLIC_BUCKET = 'images';
  process.env.R2_PUBLIC_URL = 'https://images.example.com/';
});

describe('public image storage', () => {
  it('only issues keys under the vendor and kind prefix', async () => {
    const { imagePrefix, newImageKey, isImageKey } = await import('../src/lib/storage');
    const logo = newImageKey('logo', 'vendor-1', 'image/png');
    const photo = newImageKey('listing', 'vendor-1', 'image/webp');
    expect(logo.startsWith(imagePrefix('logo', 'vendor-1'))).toBe(true);
    expect(logo.endsWith('.png')).toBe(true);
    expect(photo.startsWith('listing-images/vendor-1/')).toBe(true);
    expect(isImageKey(logo)).toBe(true);
    // KYC documents live in the private bucket and must never be treated as public images.
    expect(isImageKey('vendor-docs/vendor-1/x.pdf')).toBe(false);
  });

  it('turns keys into public URLs and passes legacy values through', async () => {
    const { publicImageUrl } = await import('../src/lib/storage');
    expect(publicImageUrl('vendor-logos/v/a.jpg')).toBe('https://images.example.com/vendor-logos/v/a.jpg');
    expect(publicImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(publicImageUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
    expect(publicImageUrl('file:///data/user/0/cache/logo.jpg')).toBeNull();
    expect(publicImageUrl(null)).toBeNull();
    expect(publicImageUrl('')).toBeNull();
  });

  it("rejects a key from another vendor or kind before touching the bucket", async () => {
    const { checkOwnImageKey } = await import('../src/lib/images');
    expect(await checkOwnImageKey('logo', 'vendor-1', 'vendor-logos/vendor-2/a.jpg')).toBe('Invalid image reference.');
    expect(await checkOwnImageKey('logo', 'vendor-1', 'listing-images/vendor-1/a.jpg')).toBe('Invalid image reference.');
    expect(await checkOwnImageKey('logo', 'vendor-1', 'vendor-logos/vendor-1/../vendor-2/a.jpg')).toBe(
      'Invalid image reference.'
    );
  });

  it('reports public storage as configured only when both bucket and URL are set', async () => {
    const { publicStorageConfigured } = await import('../src/lib/storage');
    expect(publicStorageConfigured()).toBe(true);
    delete process.env.R2_PUBLIC_URL;
    expect(publicStorageConfigured()).toBe(false);
    process.env.R2_PUBLIC_URL = 'https://images.example.com/';
  });
});
