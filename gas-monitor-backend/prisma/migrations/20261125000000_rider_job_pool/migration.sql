-- Rider job pool: vendors accept, riders claim from a pool, delivery needs the customer's PIN.
-- The data backfill is a separate migration: a new enum value cannot be used in the transaction that adds it.

-- CreateEnum
CREATE TYPE "DispatchAction" AS ENUM ('NOTIFY_RIDERS', 'ASSIGN_RIDER', 'CANCEL_ORDER', 'FOLLOW_UP_VENDOR', 'FOLLOW_UP_DELIVERY');

-- CreateEnum
CREATE TYPE "DispatchSuggestionStatus" AS ENUM ('OPEN', 'APPLIED', 'DISMISSED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'ACCEPTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'DISPATCH_SUGGESTION_APPLIED';
ALTER TYPE "AuditAction" ADD VALUE 'DISPATCH_SUGGESTION_DISMISSED';

-- AlterTable
ALTER TABLE "rider_profiles" ADD COLUMN     "isOnline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryPin" TEXT,
ADD COLUMN     "pickedUpAt" TIMESTAMP(3),
ADD COLUMN     "pinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3),
ADD COLUMN     "poolEnteredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "dispatchAssignAfterMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "dispatchCancelAfterMin" INTEGER NOT NULL DEFAULT 45,
ADD COLUMN     "dispatchDeliveryStallMin" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "dispatchNotifyAfterMin" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "dispatchRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "dispatchVendorStallMin" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "platformPickupAddress" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "dispatch_suggestions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" "DispatchAction" NOT NULL,
    "status" "DispatchSuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "episode" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedByName" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_suggestions_dedupeKey_key" ON "dispatch_suggestions"("dedupeKey");

-- CreateIndex
CREATE INDEX "dispatch_suggestions_status_createdAt_idx" ON "dispatch_suggestions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "dispatch_suggestions_orderId_idx" ON "dispatch_suggestions"("orderId");

-- CreateIndex
CREATE INDEX "orders_status_riderId_idx" ON "orders"("status", "riderId");

-- AddForeignKey
ALTER TABLE "dispatch_suggestions" ADD CONSTRAINT "dispatch_suggestions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

