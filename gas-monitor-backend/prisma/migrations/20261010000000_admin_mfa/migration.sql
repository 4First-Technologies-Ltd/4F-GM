-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_MFA_ENABLED';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_MFA_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'ADMIN_MFA_FAILED';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaLastStep" INTEGER,
ADD COLUMN     "mfaRecoveryHashes" TEXT[],
ADD COLUMN     "mfaSecret" TEXT;
