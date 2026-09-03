import type { AuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from './prisma';

/**
 * Append an entry to the admin audit trail.
 *
 * Never throws: an audit-write failure must not roll back or 500 the action the
 * operator just performed. Failures are logged so they surface in Sentry's
 * console capture rather than disappearing.
 *
 * Actor details are snapshotted (not a foreign key) so the trail survives the
 * admin being deleted, and so the env-var root account — which has no
 * admin_users row — can be recorded like any other actor.
 */
export async function writeAuditLog(
  req: Request,
  entry: {
    action: AuditAction;
    resource: string;
    resourceId?: string | null;
    summary: string;
    metadata?: Prisma.InputJsonValue;
  }
): Promise<void> {
  const admin = req.admin;
  if (!admin) return;

  try {
    await prisma.auditLog.create({
      data: {
        actorId: admin.adminId,
        actorName: admin.name,
        actorEmail: admin.username,
        actorRole: admin.role,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId ?? null,
        summary: entry.summary,
        metadata: entry.metadata
      }
    });
  } catch (err) {
    console.error('[audit] failed to write audit log', {
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      err
    });
  }
}
