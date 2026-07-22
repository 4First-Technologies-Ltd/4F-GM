'use client';

import { useEffect, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { vendorApi, VendorDocument, ApiRequestError } from '@/lib/api';
import { IconFileText } from '@/components/icons';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user && user.role !== 'VENDOR') {
      router.replace('/dashboard');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user?.role !== 'VENDOR') return;
    vendorApi
      .getProfile()
      .then((profile) => setDocuments(profile.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.role]);

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

  if (user?.role !== 'VENDOR') return null;

  return (
    <div className="settings-page">
      <section className="card settings-section">
        <h2>Documents</h2>
        <p className="hero-card-sub">Identity and business registration documents on file for verification.</p>

        {loading ? (
          <p className="hero-card-sub">Loading…</p>
        ) : documents.length === 0 ? (
          <div className="document-empty">
            <IconFileText className="document-empty-icon" />
            <p>No documents yet.</p>
            <p className="hero-card-sub">Add an identity or business registration document to help verify your account.</p>
          </div>
        ) : (
          <ul className="document-list">
            {documents.map((doc) => (
              <li key={doc.id} className="document-row">
                <span className="document-row-icon" aria-hidden="true">
                  <IconFileText />
                </span>
                <div className="document-row-info">
                  <strong>{doc.fileName}</strong>
                  <span className="hero-card-sub">Uploaded {new Date(doc.createdAt).toLocaleDateString()}</span>
                </div>
                <a href={doc.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  View
                </a>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <label htmlFor="document-upload" className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }}>
          {uploading ? 'Uploading…' : 'Add document'}
        </label>
        <input
          id="document-upload"
          type="file"
          accept="image/*,.pdf"
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: 'none' }}
        />

        {documents.length > 0 && (
          <p className="form-hint" style={{ marginTop: '0.75rem' }}>
            Documents are reviewed by our team and can&apos;t be removed once submitted.
          </p>
        )}
      </section>
    </div>
  );
}
