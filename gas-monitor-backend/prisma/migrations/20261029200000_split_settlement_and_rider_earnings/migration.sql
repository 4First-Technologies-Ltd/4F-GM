-- Orders: delivery fee is frozen per order; gateway split bookkeeping.
-- Existing orders keep deliveryFee = 0, i.e. the previous maths (fee inside the vendor's gross).
ALTER TABLE "orders" ADD COLUMN "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "vendorSettledByGateway" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "vendorSplitAmount" DOUBLE PRECISION;

-- Vendor payee ids per gateway
ALTER TABLE "vendor_bank_accounts" ADD COLUMN "gatewayRecipients" JSONB NOT NULL DEFAULT '{}';

-- Earnings the gateway already paid out
ALTER TYPE "EarningStatus" ADD VALUE 'SETTLED';

-- Rider share of the delivery fee (placeholder 70%)
ALTER TABLE "platform_settings" ADD COLUMN "riderSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 70;

-- CreateEnum
CREATE TYPE "RiderEarningStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "rider_earnings" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "RiderEarningStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL,
    "paystackTransferCode" TEXT,
    "failureReason" TEXT,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "accountName" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_earnings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_earnings_orderId_key" ON "rider_earnings"("orderId");
CREATE UNIQUE INDEX "rider_earnings_reference_key" ON "rider_earnings"("reference");
CREATE INDEX "rider_earnings_riderId_status_idx" ON "rider_earnings"("riderId", "status");
CREATE INDEX "rider_earnings_status_idx" ON "rider_earnings"("status");

ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rider_earnings" ADD CONSTRAINT "rider_earnings_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
