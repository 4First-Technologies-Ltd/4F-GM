import { imageExists, imagePrefix, publicImageUrl, type ImageKind } from './storage';

/** Swap a stored logo value for a browser-ready URL. */
export const withLogo = <T extends { logoUrl: string | null }>(profile: T): T => ({
  ...profile,
  logoUrl: publicImageUrl(profile.logoUrl)
});

/** Add `imageUrl` next to the stored `imageKey`. */
export const withImage = <T extends { imageKey: string | null }>(listing: T) => ({
  ...listing,
  imageUrl: publicImageUrl(listing.imageKey)
});

/**
 * A client may only point at a key it was issued for itself: under its own
 * vendor prefix, of the right kind, and actually present in the bucket.
 * Returns an error message, or null when the key is fine.
 */
export async function checkOwnImageKey(kind: ImageKind, vendorProfileId: string, key: string): Promise<string | null> {
  if (!key.startsWith(imagePrefix(kind, vendorProfileId)) || key.includes('..')) {
    return 'Invalid image reference.';
  }
  if (!(await imageExists(key))) return 'Upload was not completed. Please try again.';
  return null;
}
