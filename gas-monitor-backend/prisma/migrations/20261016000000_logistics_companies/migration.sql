-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LOGISTICS_COMPANY';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE 'COMPANY_STATUS_RESET';

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "logistics_companies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT,
    "city" TEXT,
    "phone" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_invites" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'INVITED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_invites_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "rider_profiles" ADD COLUMN "companyId" TEXT,
ADD COLUMN "approvedViaCompany" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "logistics_companies_userId_key" ON "logistics_companies"("userId");
CREATE UNIQUE INDEX "fleet_invites_companyId_email_key" ON "fleet_invites"("companyId", "email");
CREATE INDEX "fleet_invites_userId_idx" ON "fleet_invites"("userId");
CREATE INDEX "rider_profiles_companyId_idx" ON "rider_profiles"("companyId");

-- AddForeignKey
ALTER TABLE "logistics_companies" ADD CONSTRAINT "logistics_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fleet_invites" ADD CONSTRAINT "fleet_invites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "logistics_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rider_profiles" ADD CONSTRAINT "rider_profiles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "logistics_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
