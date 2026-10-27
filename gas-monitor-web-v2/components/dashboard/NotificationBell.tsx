'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { notificationsApi } from '@/lib/api';

/** Bell with an unread badge; opens the inbox. Re-checks every minute. */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let live = true;
    const load = () =>
      notificationsApi
        .unreadCount()
        .then((n) => live && setUnread(n))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/dashboard/notifications"
      className="relative p-1.5 hover:bg-muted rounded-lg transition-colors text-muted-foreground"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-[1.1rem] h-[1.1rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}
