'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function NavAuthActions() {
  const { user, loading } = useAuth();

  if (loading) {
    return <span className="nav-cta nav-cta-ghost" aria-hidden="true" />;
  }

  if (user) {
    return (
      <div className="nav-auth-group">
        <Link href="/dashboard" className="nav-cta">
          Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="nav-auth-group">
      <Link href="/sign-in" className="nav-cta nav-cta-outline">
        Sign in
      </Link>
      <Link href="/sign-up" className="nav-cta">
        Get started
      </Link>
    </div>
  );
}
