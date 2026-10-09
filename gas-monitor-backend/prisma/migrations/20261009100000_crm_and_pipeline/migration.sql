-- CreateEnum
CREATE TYPE "LeadType" AS ENUM ('VENDOR', 'RIDER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'ONBOARDING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('REFERRAL', 'OUTREACH', 'WEBSITE', 'SOCIAL', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'CALL', 'MESSAGE', 'MEETING', 'STAGE_CHANGE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'LEAD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAD_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'LEAD_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'CRM_NOTE_ADDED';
ALTER TYPE "AuditAction" ADD VALUE 'CRM_TAG_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'TASK_CHANGED';

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_user_tags" (
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "crm_user_tags_pkey" PRIMARY KEY ("userId","tagId")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LeadType" NOT NULL DEFAULT 'VENDOR',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'OUTREACH',
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "state" TEXT,
    "city" TEXT,
    "lostReason" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "nextFollowUpAt" TIMESTAMP(3),
    "convertedUserId" TEXT,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "leadId" TEXT,
    "userId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_notes_userId_createdAt_idx" ON "crm_notes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tags_name_key" ON "crm_tags"("name");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "crm_tasks_status_dueAt_idx" ON "crm_tasks"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_user_tags" ADD CONSTRAINT "crm_user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_user_tags" ADD CONSTRAINT "crm_user_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "crm_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

