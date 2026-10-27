'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { notificationsApi, type AppNotification } from '@/lib/api';

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Messages from the 4FG team (broadcasts sent from the admin panel). */
export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { notifications } = await notificationsApi.list();
      setItems(notifications);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your messages.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function open(n: AppNotification) {
    if (n.readAt) return;
    setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? cur);
    notificationsApi.markRead(n.id).catch(() => {});
  }

  function readAll() {
    setItems((cur) => cur?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? cur);
    notificationsApi.markAllRead().catch(() => {});
  }

  const hasUnread = items?.some((n) => !n.readAt) ?? false;

  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Messages</h2>
        {hasUnread && (
          <button type="button" onClick={readAll} className="text-sm font-medium text-primary hover:underline">
            Mark all read
          </button>
        )}
      </div>

      {error ? (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : !items ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No messages yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Notes from the 4FG team will show up here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                  n.readAt ? 'bg-card border-border' : 'bg-primary/5 border-primary/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}
                  <span className="flex-1 font-semibold text-foreground">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{when(n.createdAt)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
