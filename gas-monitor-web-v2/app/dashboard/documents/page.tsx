'use client';

import { useEffect, useState, ChangeEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorDocument, ApiRequestError } from '@/lib/api';
import { AlertCircle, FileText } from 'lucide-react';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPage() {
  const { user } = useAuth();
  const isVendor = user?.role === 'VENDOR';

  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVendor) return;
    let cancelled = false;
    vendorApi
      .getProfile()
      .then((profile) => {
        if (!cancelled) setDocuments(profile.documents ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your documents.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isVendor]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await readFileAsDataUrl(file);
      await vendorApi.uploadDocuments([{ url, fileName: file.name }]);
      const profile = await vendorApi.getProfile();
      setDocuments(profile.documents ?? []);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not upload that document.');
    } finally {
      setUploading(false);
    }
  }

  if (!isVendor) return null;

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-2">Documents</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Identity and business registration documents on file for verification.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mb-3" aria-hidden="true" />
            <p className="font-medium text-foreground">No documents yet.</p>
            <p className="text-sm mt-1">Add an identity or business registration document to help verify your account.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border -my-3">
            {documents.map((doc) => (
              <li key={doc.id} className="py-3 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{doc.fileName}</p>
                  <p className="text-xs text-muted-foreground">Uploaded {new Date(doc.createdAt).toLocaleDateString()}</p>
                </div>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div
            className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <div className="mt-6">
          <label
            htmlFor="document-upload"
            className={`inline-block px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium transition-colors ${
              uploading ? 'opacity-60 pointer-events-none' : 'cursor-pointer hover:bg-primary/90'
            }`}
          >
            {uploading ? 'Uploading…' : 'Add document'}
          </label>
          <input
            id="document-upload"
            type="file"
            accept="image/*,.pdf"
            onChange={handleUpload}
            disabled={uploading}
            className="sr-only"
          />
        </div>

        {documents.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Documents are reviewed by our team and can&apos;t be removed once submitted.
          </p>
        )}
      </div>
    </div>
  );
}
