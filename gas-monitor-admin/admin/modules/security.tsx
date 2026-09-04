import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import type { BlockedIpRow } from './types';

/*
 * TODO(admin-os): backend not implemented. This module is UI-only by decision —
 * enforcement lands at the VPS stage. The endpoints it expects:
 *
 *   GET    /api/admin/security/blocked-ips?page&limit&q&sort&dir&active&scope
 *          -> { data: BlockedIpRow[], pagination: { total, page, limit, pages } }
 *   POST   /api/admin/security/blocked-ips
 *          body   { ipAddress: string; reason?: string; scope: 'ALL'|'AUTH'|'API'; expiresAt?: string|null }
 *          -> { blockedIp: BlockedIpRow }
 *   PATCH  /api/admin/security/blocked-ips/:id   body { active: boolean }
 *          -> { blockedIp: BlockedIpRow }
 *   DELETE /api/admin/security/blocked-ips/:id   -> { ok: true }
 *
 *   authz  security.read -> requireAdmin; block/unblock -> requireSuperAdmin
 *   audit  every block and unblock must write an AuditLog entry
 *
 * PREREQUISITE — `app.set('trust proxy', 1)` is NOT set in gas-monitor-backend.
 * Until it is, req.ip resolves to Render's load balancer, so every recorded
 * address would be identical and the first enforced block would take the API
 * offline. Do not wire enforcement before fixing that.
 */

const data = createDataSource<BlockedIpRow>({
  path: '/security/blocked-ips',
  singleKey: 'blockedIp',
  supports: { create: true, update: true, remove: true }
});

export const securityData = data;

export const securityModule: ResourceConfig<BlockedIpRow> = {
  resource: 'security',
  label: 'Blocked addresses',
  labelSingular: 'Block',

  primaryKey: 'id',
  displayField: 'ipAddress',

  columns: [
    {
      key: 'ipAddress',
      header: 'Address',
      accessor: (b) => b.ipAddress,
      priority: 1,
      render: (b) => (
        <>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{b.ipAddress}</span>
          {b.reason && <span className="adm-td-sub">{b.reason}</span>}
        </>
      )
    },
    {
      key: 'active',
      header: 'State',
      accessor: (b) => (b.active ? 'BLOCKED' : 'EXPIRED_BLOCK'),
      type: 'status',
      priority: 1
    },
    { key: 'scope', header: 'Scope', accessor: (b) => b.scope, type: 'status', priority: 2 },
    { key: 'hitCount', header: 'Hits', accessor: (b) => b.hitCount, type: 'number', priority: 1 },
    {
      key: 'expiresAt',
      header: 'Expires',
      accessor: (b) => b.expiresAt,
      priority: 2,
      render: (b) =>
        b.expiresAt ? (
          <span title={formatDateTime(b.expiresAt)}>{formatRelative(b.expiresAt)}</span>
        ) : (
          <span className="adm-muted">Permanent</span>
        )
    },
    { key: 'createdByName', header: 'Blocked by', accessor: (b) => b.createdByName, priority: 3 },
    {
      key: 'createdAt',
      header: 'Added',
      accessor: (b) => b.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 3,
      render: (b) => <span title={formatDateTime(b.createdAt)}>{formatRelative(b.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'active',
      label: 'State',
      type: 'segmented',
      options: [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Lifted' }
      ]
    },
    {
      key: 'scope',
      label: 'Scope',
      type: 'select',
      secondary: true,
      options: [
        { value: 'ALL', label: 'All traffic' },
        { value: 'AUTH', label: 'Auth only' },
        { value: 'API', label: 'API only' }
      ]
    }
  ],

  search: { placeholder: 'Search address or reason…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'lift',
      label: 'Lift block',
      permission: 'security.unblock',
      disabledHint: 'Requires the Super admin role',
      visible: (b) => b.active,
      confirm: {
        title: 'Lift this block?',
        body: 'Traffic from this address will be allowed again. Recorded in the audit log.',
        confirmLabel: 'Lift block'
      },
      run: async (block, h) => {
        await data.update!(block.id, { active: false });
        h.toast(`${block.ipAddress} unblocked`);
        h.refresh();
      }
    },
    {
      key: 'reblock',
      label: 'Re-block',
      variant: 'danger',
      permission: 'security.block',
      disabledHint: 'Requires the Super admin role',
      visible: (b) => !b.active,
      run: async (block, h) => {
        await data.update!(block.id, { active: true });
        h.toast(`${block.ipAddress} blocked`);
        h.refresh();
      }
    },
    {
      key: 'delete',
      label: 'Remove',
      variant: 'danger',
      permission: 'security.unblock',
      disabledHint: 'Requires the Super admin role',
      confirm: {
        title: 'Remove this entry?',
        body: 'The address is removed from the blocklist entirely, along with its hit history. Lifting the block instead keeps the record.',
        confirmLabel: 'Remove entry',
        typeToConfirm: (b) => b.ipAddress
      },
      run: async (block, h) => {
        await data.remove!(block.id);
        h.toast(`${block.ipAddress} removed from the blocklist`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (b) => b.ipAddress,
    subtitle: (b) => b.reason ?? 'No reason recorded',
    statusField: 'active',
    sections: [
      {
        title: 'Block',
        fields: [
          { key: 'ipAddress', label: 'Address', accessor: (b) => b.ipAddress },
          { key: 'scope', label: 'Scope', accessor: (b) => b.scope, type: 'status' },
          { key: 'reason', label: 'Reason', accessor: (b) => b.reason, full: true },
          {
            key: 'expiresAt',
            label: 'Expires',
            accessor: (b) => b.expiresAt,
            render: (b) => (b.expiresAt ? formatDateTime(b.expiresAt) : 'Permanent')
          },
          { key: 'hitCount', label: 'Requests blocked', accessor: (b) => formatNumber(b.hitCount) },
          { key: 'createdAt', label: 'Added', accessor: (b) => b.createdAt, type: 'date' },
          { key: 'createdByName', label: 'Added by', accessor: (b) => b.createdByName }
        ]
      }
    ]
  },

  permissions: {
    read: 'security.read',
    create: 'security.block',
    update: 'security.block',
    delete: 'security.unblock',
    block: 'security.block',
    unblock: 'security.unblock'
  },

  data,

  emptyState: {
    title: 'No addresses blocked',
    description: 'Blocked addresses appear here. Blocking is not enforced yet — see the notice above.'
  }
};
