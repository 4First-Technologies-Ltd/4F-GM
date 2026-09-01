'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ordersApi, Order } from '@/lib/api';
import { formatNaira, STATUS_LABEL } from '@/lib/format';
import { TiltCard } from '@/components/motion/tilt-card';
import { Package, Bell, Wallet, AlertCircle, ArrowRight } from 'lucide-react';

const STATUS_ORDER: Order['status'][] = ['PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

const STATUS_COLORS: Record<Order['status'], string> = {
  PENDING: 'bg-amber-100/50 h-1',
  CONFIRMED: 'bg-blue-100/50 h-1',
  DELIVERED: 'bg-green-100/50 h-1',
  CANCELLED: 'bg-red-100/50 h-1'
};

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isVendor = user?.role === 'VENDOR';

  // Vendors keep their overview at /dashboard — this route is consumer-only
  useEffect(() => {
    if (isVendor) router.replace('/dashboard');
  }, [isVendor, router]);

  if (isVendor) return null;
  return <ConsumerOverview />;
}

function ConsumerOverview() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ordersApi
      .list()
      .then((data) => {
        if (!cancelled) setOrders(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load orders.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const totalSpend = orders
      .filter((o) => o.status === 'CONFIRMED' || o.status === 'DELIVERED')
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const pending = orders.filter((o) => o.status === 'PENDING').length;
    const byStatus = STATUS_ORDER.map((status) => ({
      status,
      count: orders.filter((o) => o.status === status).length
    }));
    const max = Math.max(1, ...byStatus.map((s) => s.count));
    return { totalSpend, pending, total: orders.length, byStatus, max };
  }, [orders]);

  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-1">
          Welcome back, {user?.name.split(' ')[0]}
        </h2>
        <p className="text-sm text-muted-foreground">Here&apos;s how your account is doing.</p>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TiltCard
          className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 rounded-2xl"
          max={8}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-2.5 bg-primary/20 rounded-lg">
              <Package className="h-5 w-5 text-primary" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-1 font-medium">Total orders</p>
          <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.total}</p>
        </TiltCard>

        <TiltCard
          className="bg-gradient-to-br from-amber-100/50 to-amber-50/50 border border-amber-200/30 p-6 rounded-2xl"
          max={8}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-2.5 bg-amber-100/70 rounded-lg">
              <Bell className="h-5 w-5 text-amber-700" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-1 font-medium">Pending</p>
          <p className="text-2xl font-bold text-foreground">{loading ? '—' : stats.pending}</p>
        </TiltCard>

        <TiltCard
          className="bg-gradient-to-br from-green-100/50 to-green-50/50 border border-green-200/30 p-6 rounded-2xl"
          max={8}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-2.5 bg-green-100/70 rounded-lg">
              <Wallet className="h-5 w-5 text-green-700" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-1 font-medium">Total spend</p>
          <p className="text-2xl font-bold text-foreground">{loading ? '—' : formatNaira(stats.totalSpend)}</p>
        </TiltCard>

        <TiltCard
          className="bg-gradient-to-br from-primary to-primary/90 border border-primary/30 p-6 rounded-2xl cursor-pointer hover:shadow-lg transition-shadow"
          max={8}
        >
          <Link
            href="/marketplace"
            className="flex flex-col justify-between h-full group"
          >
            <p className="text-xs text-primary-foreground/80 mb-1 font-medium">Quick action</p>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-primary-foreground">Place an order</p>
              <ArrowRight className="h-4 w-4 text-primary-foreground/60 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </TiltCard>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Orders by Status */}
        <div className="lg:col-span-1 rounded-2xl bg-card border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-6">Orders by status</h3>
          {orders.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">
              No orders yet — your breakdown will appear here.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Status Cards */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                {stats.byStatus.map((s) => (
                  <div key={s.status} className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">{STATUS_LABEL[s.status]}</p>
                    <p className="text-xl font-bold text-foreground">{s.count}</p>
                  </div>
                ))}
              </div>

              {/* Status Bar */}
              <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted/50">
                {stats.total === 0 ? (
                  <div className="flex-1 bg-muted" />
                ) : (
                  stats.byStatus.map((s) => (
                    <div
                      key={s.status}
                      className={STATUS_COLORS[s.status]}
                      style={{ flex: s.count / stats.total || 0.01 }}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">Recent orders</h3>
            <Link
              href="/dashboard/orders"
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              View all
            </Link>
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground">Loading orders…</p>
          )}
          {!loading && recentOrders.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No orders yet.{' '}
              <Link href="/marketplace" className="text-primary hover:text-primary/80 font-medium">
                Place your first refill order
              </Link>
              .
            </p>
          )}
          {recentOrders.length > 0 && (
            <div className="space-y-3">
              {recentOrders.map((order, idx) => (
                <div
                  key={order.id}
                  className={`flex items-center justify-between py-3 px-0 ${
                    idx !== recentOrders.length - 1 ? 'border-b border-border' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate">
                      {order.supplierName ?? 'Order'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {order.cylinderSize} × {order.quantity} · {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                      {formatNaira(order.totalAmount)}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                        order.status === 'PENDING'
                          ? 'bg-amber-100/50 text-amber-700'
                          : order.status === 'CONFIRMED'
                          ? 'bg-blue-100/50 text-blue-700'
                          : order.status === 'DELIVERED'
                          ? 'bg-green-100/50 text-green-700'
                          : 'bg-red-100/50 text-red-700'
                      }`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
