-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BRANCH_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'BRANCH_RESTORED';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT;
