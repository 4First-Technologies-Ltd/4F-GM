-- AlterTable
-- Every existing order was paid through Paystack, which is also the default for new ones.
ALTER TABLE "orders" ADD COLUMN "paymentProvider" TEXT NOT NULL DEFAULT 'PAYSTACK';
