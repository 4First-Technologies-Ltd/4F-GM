-- CreateEnum
CREATE TYPE "ServerLogLevel" AS ENUM ('WARN', 'ERROR');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'BRIEFING_GENERATED';

-- CreateTable
CREATE TABLE "server_logs" (
    "id" TEXT NOT NULL,
    "level" "ServerLogLevel" NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "role" TEXT,
    "platform" TEXT NOT NULL,
    "sessionId" TEXT,
    "screen" TEXT,
    "properties" JSONB,
    "appVersion" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_briefings" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sendError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_briefings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_logs_createdAt_idx" ON "server_logs"("createdAt");

-- CreateIndex
CREATE INDEX "server_logs_level_createdAt_idx" ON "server_logs"("level", "createdAt");

-- CreateIndex
CREATE INDEX "app_events_name_occurredAt_idx" ON "app_events"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "app_events_userId_occurredAt_idx" ON "app_events"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "app_events_anonymousId_idx" ON "app_events"("anonymousId");

-- CreateIndex
CREATE INDEX "app_events_occurredAt_idx" ON "app_events"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ops_briefings_day_key" ON "ops_briefings"("day");

