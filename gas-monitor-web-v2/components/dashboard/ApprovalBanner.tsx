'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const COPY = {
  VENDOR: {
    title: 'Your store is awaiting approval',
    body: 'Customers can’t see your store or order from you yet. Set up your listings and branches now. Everything goes live as soon as you’re approved.'
  },
  RIDER: {
    title: 'Your rider account is awaiting approval',
    body: 'You can look around, but you won’t be assigned deliveries until you’re approved.'
  },
  LOGISTICS_COMPANY: {
    title: 'Your company is awaiting approval',
    body: 'Your riders can’t take deliveries and you can’t invite riders until you’re approved.'
  }
} as const;

/** Shown on a vendor, rider or company dashboard while the account is PENDING approval. */
export default function ApprovalBanner() {
  const { user, refreshUser } = useAuth();

  // An approval made in the admin panel shows up on the next visit without signing out.
  useEffect(() => {
    refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;
  const status =
    user.role === 'VENDOR'
      ? user.vendorStatus
      : user.role === 'RIDER'
        ? user.riderStatus
        : user.role === 'LOGISTICS_COMPANY'
          ? user.companyStatus
          : undefined;
  if (status !== 'PENDING' || !(user.role in COPY)) return null;
  const { title, body } = COPY[user.role as keyof typeof COPY];

  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
    >
      <Clock className="mt-0.5 h-5 w-5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-sm">{body}</p>
        {user.role === 'VENDOR' && user.vendorRcNumberMissing && (
          <p className="mt-1 text-sm font-medium">
            We can’t approve you until you add your RC number.{' '}
            <Link href="/dashboard/profile" className="underline">
              Add it on your profile
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
