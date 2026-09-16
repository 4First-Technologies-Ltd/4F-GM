-- AlterTable
-- 4FG Monitor pricing moves from code into admin-controlled settings. The
-- defaults are the values previously hardcoded, so nothing changes on deploy.
ALTER TABLE "platform_settings"
  ADD COLUMN "monitorUnitPrice" INTEGER NOT NULL DEFAULT 45000,
  ADD COLUMN "monitorDeliveryFee" INTEGER NOT NULL DEFAULT 2000,
  ADD COLUMN "monitorMinQuantity" INTEGER NOT NULL DEFAULT 10;
