-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('VENDOR_APPROVED', 'VENDOR_REJECTED', 'VENDOR_STATUS_RESET', 'LISTING_STOCK_UPDATED', 'USER_CREATED', 'USER_UPDATED', 'USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_DELETED', 'ADMIN_CREATED', 'ADMIN_UPDATED', 'ADMIN_DEACTIVATED', 'ADMIN_DELETED', 'SETTINGS_UPDATED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" "AdminRole" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");
