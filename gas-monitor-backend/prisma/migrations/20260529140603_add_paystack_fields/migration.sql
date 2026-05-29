/*
  Warnings:

  - A unique constraint covering the columns `[paystackRef]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_listingId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_vendorId_fkey";

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paystackStatus" TEXT,
ADD COLUMN     "supplierName" TEXT,
ALTER COLUMN "vendorId" DROP NOT NULL,
ALTER COLUMN "listingId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_paystackRef_key" ON "orders"("paystackRef");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gas_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
