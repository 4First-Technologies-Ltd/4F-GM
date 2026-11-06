-- CreateEnum
CREATE TYPE "SmosRole" AS ENUM ('MANAGEMENT', 'MANAGER', 'REVIEWER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS');

-- CreateEnum
CREATE TYPE "SocialConnection" AS ENUM ('MANUAL', 'CONNECTED', 'EXPIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "SmosContentStatus" AS ENUM ('IDEA', 'PLANNED', 'IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHED', 'PUBLISH_FAILED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmosReviewDecision" AS ENUM ('APPROVED', 'REJECTED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "SmosTaskStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUIRED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmosReportType" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "SmosReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SmosMetricSource" AS ENUM ('MANUAL', 'ESTIMATED', 'API');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'SOCIAL';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SMOIS_ACTIVITY';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "smosRole" "SmosRole";

-- CreateTable
CREATE TABLE "smois_accounts" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'BUSINESS',
    "description" TEXT,
    "notes" TEXT,
    "connection" "SocialConnection" NOT NULL DEFAULT 'MANUAL',
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_account_assignments" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "assignedById" TEXT NOT NULL,
    "assignedByName" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "smois_account_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_content" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "category" TEXT,
    "format" TEXT NOT NULL DEFAULT 'TEXT',
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT,
    "mediaNotes" TEXT,
    "accountId" TEXT NOT NULL,
    "status" "SmosContentStatus" NOT NULL DEFAULT 'IDEA',
    "version" INTEGER NOT NULL DEFAULT 1,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "plannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_content_versions" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT,
    "editorId" TEXT NOT NULL,
    "editorName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_content_reviews" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "decision" "SmosReviewDecision" NOT NULL,
    "comments" TEXT,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_publications" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "approvedByName" TEXT,
    "bypassReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_post_metrics" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reach" INTEGER,
    "impressions" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "videoViews" INTEGER,
    "source" "SmosMetricSource" NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,

    CONSTRAINT "smois_post_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_metric_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "reach" INTEGER,
    "impressions" INTEGER,
    "engagement" INTEGER,
    "profileVisits" INTEGER,
    "videoViews" INTEGER,
    "websiteClicks" INTEGER,
    "source" "SmosMetricSource" NOT NULL DEFAULT 'MANUAL',
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" "SmosTaskStatus" NOT NULL DEFAULT 'PENDING',
    "assigneeId" TEXT NOT NULL,
    "assigneeName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "accountId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "evidenceUrl" TEXT,
    "evidenceNote" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_kpis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "accountId" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_reports" (
    "id" TEXT NOT NULL,
    "type" "SmosReportType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "status" "SmosReportStatus" NOT NULL DEFAULT 'DRAFT',
    "narrative" JSONB,
    "figures" JSONB,
    "reviewerName" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smois_accounts_platform_handle_key" ON "smois_accounts"("platform", "handle");

-- CreateIndex
CREATE INDEX "smois_account_assignments_accountId_endsAt_idx" ON "smois_account_assignments"("accountId", "endsAt");

-- CreateIndex
CREATE INDEX "smois_account_assignments_adminId_endsAt_idx" ON "smois_account_assignments"("adminId", "endsAt");

-- CreateIndex
CREATE INDEX "smois_content_status_idx" ON "smois_content"("status");

-- CreateIndex
CREATE INDEX "smois_content_accountId_plannedAt_idx" ON "smois_content"("accountId", "plannedAt");

-- CreateIndex
CREATE INDEX "smois_content_creatorId_idx" ON "smois_content"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "smois_content_versions_contentId_version_key" ON "smois_content_versions"("contentId", "version");

-- CreateIndex
CREATE INDEX "smois_content_reviews_contentId_idx" ON "smois_content_reviews"("contentId");

-- CreateIndex
CREATE INDEX "smois_publications_accountId_publishedAt_idx" ON "smois_publications"("accountId", "publishedAt");

-- CreateIndex
CREATE INDEX "smois_post_metrics_publicationId_capturedAt_idx" ON "smois_post_metrics"("publicationId", "capturedAt");

-- CreateIndex
CREATE INDEX "smois_metric_snapshots_date_idx" ON "smois_metric_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "smois_metric_snapshots_accountId_date_key" ON "smois_metric_snapshots"("accountId", "date");

-- CreateIndex
CREATE INDEX "smois_tasks_assigneeId_status_idx" ON "smois_tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "smois_tasks_status_dueAt_idx" ON "smois_tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "smois_kpis_periodEnd_idx" ON "smois_kpis"("periodEnd");

-- CreateIndex
CREATE INDEX "smois_reports_status_idx" ON "smois_reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "smois_reports_type_authorId_periodStart_key" ON "smois_reports"("type", "authorId", "periodStart");

-- AddForeignKey
ALTER TABLE "smois_account_assignments" ADD CONSTRAINT "smois_account_assignments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_content" ADD CONSTRAINT "smois_content_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_content_versions" ADD CONSTRAINT "smois_content_versions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "smois_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_content_reviews" ADD CONSTRAINT "smois_content_reviews_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "smois_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_publications" ADD CONSTRAINT "smois_publications_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "smois_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_post_metrics" ADD CONSTRAINT "smois_post_metrics_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "smois_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_metric_snapshots" ADD CONSTRAINT "smois_metric_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_tasks" ADD CONSTRAINT "smois_tasks_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_kpis" ADD CONSTRAINT "smois_kpis_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "smois_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

