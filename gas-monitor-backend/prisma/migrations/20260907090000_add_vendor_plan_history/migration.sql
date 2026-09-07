-- CreateEnum
CREATE TYPE "PlanChangeActor" AS ENUM ('VENDOR', 'ADMIN');

-- CreateTable
CREATE TABLE "vendor_plan_changes" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "fromPlan" "VendorPlan" NOT NULL,
    "toPlan" "VendorPlan" NOT NULL,
    "actor" "PlanChangeActor" NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "bypassedCooldown" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_plan_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_plan_changes_vendorId_createdAt_idx" ON "vendor_plan_changes"("vendorId", "createdAt");

-- AddForeignKey
ALTER TABLE "vendor_plan_changes"
  ADD CONSTRAINT "vendor_plan_changes_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
