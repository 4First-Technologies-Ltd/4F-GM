import {
  IconBike,
  IconBug,
  IconChecklist,
  IconActivity,
  IconBriefing,
  IconTerminal,
  IconFunnel,
  IconChartBar,
  IconGrid,
  IconInbox,
  IconMegaphone,
  IconKey,
  IconPackage,
  IconScroll,
  IconSettings,
  IconShield,
  IconStore,
  IconTag,
  IconUserCircle,
  IconUsers,
  IconWallet
} from '@/components/icons';

/**
 * The SINGLE source of truth for navigation.
 *
 * The sidebar, breadcrumbs, and page titles all read this. A navigation array
 * duplicated across those surfaces is how they drift apart.
 */

type IconComponent = (props: { className?: string }) => React.JSX.Element;

export interface NavItem {
  label: string;
  route: string;
  icon: IconComponent;
  /** Hidden entirely when the viewer lacks this permission. */
  permission?: string;
  /** Match the route exactly rather than by prefix (needed for the index route). */
  exact?: boolean;
  /** Key into the counts resolved once by the shell. */
  badge?: { key: 'pendingVendors' | 'pendingOrders' | 'pendingRiders' | 'openTickets' | 'payoutIssues' | 'followUps'; tone?: 'warning' | 'error' };
}

export interface NavSection {
  section?: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    items: [{ label: 'Overview', route: '/dashboard', icon: IconGrid, exact: true }]
  },
  {
    section: 'Directory',
    items: [
      {
        label: 'Vendors',
        route: '/dashboard/vendors',
        icon: IconStore,
        permission: 'vendors.read',
        badge: { key: 'pendingVendors', tone: 'warning' }
      },
      {
        label: 'Riders',
        route: '/dashboard/riders',
        icon: IconBike,
        permission: 'riders.read',
        badge: { key: 'pendingRiders', tone: 'warning' }
      },
      { label: 'Customers', route: '/dashboard/customers', icon: IconUserCircle, permission: 'customers.read' },
      { label: 'All users', route: '/dashboard/users', icon: IconUsers, permission: 'users.read' }
    ]
  },
  {
    section: 'Operations',
    items: [
      {
        label: 'Orders',
        route: '/dashboard/orders',
        icon: IconPackage,
        permission: 'orders.read',
        badge: { key: 'pendingOrders', tone: 'warning' }
      },
      { label: 'Listings', route: '/dashboard/listings', icon: IconTag, permission: 'listings.read' },
      {
        label: 'Support inbox',
        route: '/dashboard/support',
        icon: IconInbox,
        permission: 'support.read',
        badge: { key: 'openTickets', tone: 'warning' }
      },
      {
        label: 'Payouts',
        route: '/dashboard/payouts',
        icon: IconWallet,
        permission: 'payouts.read',
        badge: { key: 'payoutIssues', tone: 'error' }
      },
      { label: 'Error logs', route: '/dashboard/error-logs', icon: IconBug, permission: 'errors.read' }
    ]
  },
  {
    section: 'Growth',
    items: [
      {
        label: 'Pipeline',
        route: '/dashboard/pipeline',
        icon: IconFunnel,
        permission: 'crm.read',
        badge: { key: 'followUps', tone: 'warning' }
      },
      { label: 'Tasks', route: '/dashboard/tasks', icon: IconChecklist, permission: 'crm.read' },
      { label: 'Marketing', route: '/dashboard/marketing', icon: IconMegaphone, permission: 'marketing.read' }
    ]
  },
  {
    section: 'Insights',
    items: [
      { label: 'Ops briefing', route: '/dashboard/briefing', icon: IconBriefing, permission: 'briefing.read' },
      { label: 'Analytics', route: '/dashboard/analytics', icon: IconChartBar, permission: 'analytics.read' },
      { label: 'App usage', route: '/dashboard/usage', icon: IconActivity, permission: 'usage.read' }
    ]
  },
  {
    section: 'System',
    items: [
      { label: 'Audit log', route: '/dashboard/audit', icon: IconScroll, permission: 'audit.read' },
      { label: 'Server logs', route: '/dashboard/server-logs', icon: IconTerminal, permission: 'logs.read' },
      { label: 'Security', route: '/dashboard/security', icon: IconShield, permission: 'security.read' },
      { label: 'Settings', route: '/dashboard/settings', icon: IconSettings, permission: 'settings.read' },
      { label: 'Admin users', route: '/dashboard/admin-users', icon: IconKey, permission: 'admins.read' }
    ]
  }
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.exact ? pathname === item.route : pathname === item.route || pathname.startsWith(`${item.route}/`);
}

/** Breadcrumbs read the same tree — never a second hardcoded list. */
export function breadcrumbsFor(pathname: string): { label: string; route: string }[] {
  const trail: { label: string; route: string }[] = [];
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (isActive(item, pathname) && !item.exact) {
        if (section.section) trail.push({ label: section.section, route: item.route });
        trail.push({ label: item.label, route: item.route });
      }
    }
  }
  return trail;
}

export function titleFor(pathname: string): string {
  for (const section of NAVIGATION) {
    for (const item of section.items) {
      if (isActive(item, pathname)) return item.label;
    }
  }
  const seg = pathname.split('/').filter(Boolean).pop() ?? '';
  return seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
}
