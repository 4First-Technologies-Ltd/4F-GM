'use client';

import { useId, useState, type ChangeEvent } from 'react';
import { vendorApi } from '@/lib/api';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * A button that uploads a logo or listing photo to R2 as soon as a file is
 * chosen, then hands the issued key (to save with the profile/listing) and a
 * preview URL to the parent. Validation mirrors the server so most mistakes
 * are caught before any upload starts.
 */
export function ImageUpload({
  kind,
  label,
  disabled,
  onUploaded,
  onError
}: {
  kind: 'logo' | 'listing';
  label: string;
  disabled?: boolean;
  onUploaded: (result: { key: string; previewUrl: string }) => void;
  onError?: (message: string) => void;
}) {
  const id = useId();
  const [uploading, setUploading] = useState(false);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      onError?.('Choose a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      onError?.('That image is too large. The limit is 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { key, publicUrl } = await vendorApi.uploadImage(kind, file);
      // Preview from the local file: it always renders, so the thumbnail confirms the pick
      // even when the public bucket URL isn't reachable from this page.
      void publicUrl;
      onUploaded({ key, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not upload that image.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <label
        htmlFor={id}
        className={`inline-block px-3 py-2 bg-muted text-muted-foreground text-sm font-medium rounded-lg transition-colors ${
          uploading || disabled ? 'opacity-60 pointer-events-none' : 'hover:bg-muted/80 cursor-pointer'
        }`}
      >
        {uploading ? 'Uploading…' : label}
      </label>
      <input id={id} type="file" accept={ACCEPT} onChange={handleChange} className="hidden" disabled={uploading || disabled} />
    </>
  );
}
