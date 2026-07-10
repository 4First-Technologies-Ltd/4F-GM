-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP_VERIFICATION', 'PASSWORD_RESET');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "otpCodeHash" TEXT,
ADD COLUMN     "otpPurpose" "OtpPurpose",
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3),
ADD COLUMN     "otpAttempts" INTEGER NOT NULL DEFAULT 0;

-- Grandfather in accounts created before email verification existed.
UPDATE "users" SET "emailVerified" = true;
