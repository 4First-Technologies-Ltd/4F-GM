'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api';

const COPY: Record<'PENDING' | 'REJECTED', { title: string; body: string }> = {
  PENDING: {
    title: 'Application under review',
    body: 'Thanks for signing up. Our team is reviewing your business details — this usually takes 1–2 business days. We’ll email you once you’re approved.'
  },
  REJECTED: {
    title: 'Application not approved',
    body: 'Your vendor application wasn’t approved. Contact support if you think this is a mistake or want to reapply.'
  }
};

export default function VendorPendingPage() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/sign-in');
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role === 'CONSUMER') {
      router.replace('/dashboard');
    }
    if (user?.role === 'VENDOR' && user.vendorStatus === 'APPROVED') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  async function checkStatus() {
    setChecking(true);
    try {
      const fresh = await authApi.me();
      if (fresh.vendorStatus === 'APPROVED') {
        router.replace('/dashboard');
      }
    } catch {
      // ignore — user stays on this screen
    } finally {
      setChecking(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="dashboard-loading">
        <p>Loading…</p>
      </main>
    );
  }

  const status = user.vendorStatus === 'REJECTED' ? 'REJECTED' : 'PENDING';
  const copy = COPY[status];

  return (
    <main className="auth-page">
      <div className="container auth-container">
        <div className="card auth-card">
          <a className="brand" href="/">
            <span className="brand-mark">4F</span>
            <span>4FG Smart Gas Monitor</span>
          </a>
          <span className={`status-pill status-${status === 'PENDING' ? 'pending' : 'cancelled'}`}>
            {status === 'PENDING' ? 'Pending review' : 'Rejected'}
          </span>
          <h1 className="auth-title">{copy.title}</h1>
          <p className="auth-sub">{copy.body}</p>

          <button type="button" className="btn btn-primary btn-block" onClick={checkStatus} disabled={checking}>
            {checking ? 'Checking…' : 'Check status'}
          </button>

          <p className="auth-switch">
            <button
              type="button"
              className="link-underline"
              onClick={async () => {
                await logout();
                router.push('/');
              }}
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
