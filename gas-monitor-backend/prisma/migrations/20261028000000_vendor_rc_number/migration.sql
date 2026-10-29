-- AlterTable
ALTER TABLE "vendor_profiles" ADD COLUMN "rcNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_rcNumber_key" ON "vendor_profiles"("rcNumber");
