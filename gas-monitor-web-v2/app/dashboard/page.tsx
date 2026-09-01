'use client';

import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role === 'VENDOR') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">
            Welcome back, {user.name.split(' ')[0]}
          </h2>
          <p className="text-sm text-muted-foreground">Manage your gas listings and incoming orders.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Orders</h3>
            <p className="text-sm text-muted-foreground">View and manage incoming customer orders.</p>
            <a
              href="/dashboard/orders"
              className="inline-block mt-4 text-sm text-primary hover:text-primary/80 font-medium"
            >
              View orders →
            </a>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-blue-100/50 to-blue-50/50 border border-blue-200/30 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Listings</h3>
            <p className="text-sm text-muted-foreground">Create and update your gas product listings.</p>
            <a
              href="/dashboard/listings"
              className="inline-block mt-4 text-sm text-primary hover:text-primary/80 font-medium"
            >
              Manage listings →
            </a>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-green-100/50 to-green-50/50 border border-green-200/30 p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Analytics</h3>
            <p className="text-sm text-muted-foreground">Track your sales and performance metrics.</p>
            <a
              href="/dashboard/analytics"
              className="inline-block mt-4 text-sm text-primary hover:text-primary/80 font-medium"
            >
              View analytics →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Redirecting to your overview…</p>
    </div>
  );
}
