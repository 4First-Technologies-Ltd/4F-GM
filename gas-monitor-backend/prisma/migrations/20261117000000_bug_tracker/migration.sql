-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('NEW', 'NEEDS_INFO', 'CONFIRMED', 'IN_PROGRESS', 'FIXED', 'VERIFIED', 'WONT_FIX', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "BugFrequency" AS ENUM ('ALWAYS', 'SOMETIMES', 'ONCE');

-- CreateEnum
CREATE TYPE "BugAuthor" AS ENUM ('TESTER', 'ADMIN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'TESTER_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'BUG_CHANGED';

-- CreateTable
CREATE TABLE "testers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invitedByName" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "otpCodeHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "testerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "screen" TEXT,
    "steps" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "actual" TEXT NOT NULL,
    "severity" "BugSeverity" NOT NULL DEFAULT 'MEDIUM',
    "frequency" "BugFrequency" NOT NULL DEFAULT 'ALWAYS',
    "status" "BugStatus" NOT NULL DEFAULT 'NEW',
    "deviceModel" TEXT,
    "androidVersion" TEXT,
    "appVersion" TEXT,
    "network" TEXT,
    "accountEmail" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "fixedInBuild" TEXT,
    "duplicateOfNumber" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_attachments" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_comments" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "author" "BugAuthor" NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "testers_email_key" ON "testers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_number_key" ON "bug_reports"("number");

-- CreateIndex
CREATE INDEX "bug_reports_status_updatedAt_idx" ON "bug_reports"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "bug_reports_testerId_idx" ON "bug_reports"("testerId");

-- CreateIndex
CREATE INDEX "bug_reports_assigneeId_idx" ON "bug_reports"("assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "bug_attachments_key_key" ON "bug_attachments"("key");

-- CreateIndex
CREATE INDEX "bug_attachments_bugId_idx" ON "bug_attachments"("bugId");

-- CreateIndex
CREATE INDEX "bug_comments_bugId_createdAt_idx" ON "bug_comments"("bugId", "createdAt");

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "testers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_attachments" ADD CONSTRAINT "bug_attachments_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_comments" ADD CONSTRAINT "bug_comments_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

