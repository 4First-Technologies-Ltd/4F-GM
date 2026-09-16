-- AlterTable
-- Vendors now pick a state and city at sign-up. Existing vendors have neither
-- until they set them from their profile, so both stay nullable.
ALTER TABLE "vendor_profiles"
  ADD COLUMN "state" TEXT,
  ADD COLUMN "city" TEXT;
