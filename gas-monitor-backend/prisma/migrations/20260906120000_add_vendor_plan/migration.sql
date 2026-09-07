-- CreateEnum
CREATE TYPE "VendorPlan" AS ENUM ('BASIC', 'GROWTH', 'PRO');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'VENDOR_PLAN_CHANGED';

-- AlterTable
-- Existing vendors predate partner plans; they land on BASIC (5%) with no
-- cooldown, so their first switch is free.
ALTER TABLE "vendor_profiles"
  ADD COLUMN "plan" "VendorPlan" NOT NULL DEFAULT 'BASIC',
  ADD COLUMN "planChangedAt" TIMESTAMP(3),
  ADD COLUMN "planLockedUntil" TIMESTAMP(3);
