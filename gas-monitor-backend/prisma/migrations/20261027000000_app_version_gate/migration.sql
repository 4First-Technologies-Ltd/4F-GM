-- AlterTable
-- Mobile version gate. Defaults let every build that exists today keep working
-- (min 1.0.0); raise minAppVersion from the admin Settings page to force an update.
ALTER TABLE "platform_settings"
  ADD COLUMN "minAppVersion" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "latestAppVersion" TEXT NOT NULL DEFAULT '1.0.0',
  ADD COLUMN "storeUrlAndroid" TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.fourfirsttechnologies.gasmonitor',
  ADD COLUMN "storeUrlIos" TEXT NOT NULL DEFAULT '';
