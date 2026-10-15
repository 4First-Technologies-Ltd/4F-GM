import crypto from 'crypto';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Private document storage on Cloudflare R2 (S3-compatible). The bucket is
 * never public: the app uploads straight to R2 through a short-lived presigned
 * PUT, and admins read through a short-lived presigned GET.
 */
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};
export const MAX_DOC_BYTES = 8 * 1024 * 1024;

const UPLOAD_TTL_SECONDS = 5 * 60;
const VIEW_TTL_SECONDS = 5 * 60;

let client: S3Client | null = null;

export function storageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET
  );
}

function r2() {
  if (!storageConfigured()) throw new Error('Document storage is not configured');
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
    }
  });
  return client;
}

const bucket = () => process.env.R2_BUCKET!;

/** Keys are generated here, never taken from the client. */
export function newDocumentKey(vendorProfileId: string, contentType: string): string {
  return `vendor-docs/${vendorProfileId}/${crypto.randomUUID()}.${ALLOWED_DOC_TYPES[contentType]}`;
}

export const isStorageKey = (value: string) => value.startsWith('vendor-docs/');

/**
 * ContentType and ContentLength are signed, so R2 rejects an upload whose type
 * or size differs from what was validated here.
 */
export function presignUpload(key: string, contentType: string, size: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: UPLOAD_TTL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) }
  );
}

export function presignView(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: VIEW_TTL_SECONDS });
}

/** True when the object really landed in the bucket. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * Swap stored keys for short-lived view links. Rows from before storage was
 * wired up hold a phone-local file path that nobody can open, so those get a
 * null url rather than a dead link.
 */
export async function withViewUrls<T extends { url: string }>(docs: T[]): Promise<(Omit<T, 'url'> & { url: string | null })[]> {
  return Promise.all(
    docs.map(async (d) => ({
      ...d,
      url: isStorageKey(d.url) && storageConfigured() ? await presignView(d.url) : null
    }))
  );
}
