-- CreateEnum
CREATE TYPE "SmosConversationStatus" AS ENUM ('NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SmosMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'NOTE');

-- CreateEnum
CREATE TYPE "SmosSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "SmosCampaignStatus" AS ENUM ('PLANNING', 'BRIEFING', 'PREPARATION', 'APPROVAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "smois_content" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "smois_contacts" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "displayName" TEXT NOT NULL,
    "username" TEXT,
    "profileUrl" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "tags" TEXT[],
    "notes" TEXT,
    "consentNote" TEXT,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_conversations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DM',
    "subject" TEXT NOT NULL,
    "status" "SmosConversationStatus" NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "ownerId" TEXT,
    "ownerName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "escalationType" TEXT,
    "escalationNote" TEXT,
    "tags" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "SmosMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BRAND_AWARENESS',
    "objective" TEXT,
    "description" TEXT,
    "status" "SmosCampaignStatus" NOT NULL DEFAULT 'PLANNING',
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "targetAudience" TEXT,
    "budget" INTEGER,
    "spend" INTEGER,
    "expectedResults" TEXT,
    "actualResults" TEXT,
    "leads" INTEGER,
    "lessons" TEXT,
    "trackingLinks" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_mentions" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "platform" "SocialPlatform",
    "sourceUrl" TEXT,
    "excerpt" TEXT NOT NULL,
    "authorHandle" TEXT,
    "sentiment" "SmosSentiment" NOT NULL DEFAULT 'UNCERTAIN',
    "mentionedAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_competitors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "platform" "SocialPlatform" NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_competitor_readings" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER,
    "postsLastWeek" INTEGER,
    "avgEngagement" INTEGER,
    "notes" TEXT,
    "basis" TEXT NOT NULL DEFAULT 'PUBLIC_OBSERVATION',
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "smois_competitor_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smois_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "fileType" TEXT,
    "url" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "restrictions" TEXT,
    "expiresAt" DATE,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "smois_contacts_platform_username_idx" ON "smois_contacts"("platform", "username");

-- CreateIndex
CREATE INDEX "smois_conversations_status_receivedAt_idx" ON "smois_conversations"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "smois_conversations_ownerId_status_idx" ON "smois_conversations"("ownerId", "status");

-- CreateIndex
CREATE INDEX "smois_messages_conversationId_createdAt_idx" ON "smois_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "smois_campaigns_status_idx" ON "smois_campaigns"("status");

-- CreateIndex
CREATE INDEX "smois_mentions_mentionedAt_idx" ON "smois_mentions"("mentionedAt");

-- CreateIndex
CREATE INDEX "smois_mentions_sentiment_mentionedAt_idx" ON "smois_mentions"("sentiment", "mentionedAt");

-- CreateIndex
CREATE UNIQUE INDEX "smois_competitors_platform_handle_key" ON "smois_competitors"("platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "smois_competitor_readings_competitorId_date_key" ON "smois_competitor_readings"("competitorId", "date");

-- CreateIndex
CREATE INDEX "smois_assets_category_idx" ON "smois_assets"("category");

-- AddForeignKey
ALTER TABLE "smois_content" ADD CONSTRAINT "smois_content_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "smois_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_conversations" ADD CONSTRAINT "smois_conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "smois_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_messages" ADD CONSTRAINT "smois_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "smois_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smois_competitor_readings" ADD CONSTRAINT "smois_competitor_readings_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "smois_competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

