-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('QUEUED', 'SENT', 'ACKED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeviceRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "claimCodeHash" TEXT,
    "ownerId" TEXT,
    "cylinderId" TEXT,
    "nickname" TEXT,
    "emptyWeightKg" DOUBLE PRECISION,
    "platformCal" INTEGER NOT NULL DEFAULT 1,
    "fw" TEXT,
    "hwRev" TEXT,
    "imei" TEXT,
    "iccid" TEXT,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_states" (
    "deviceId" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastReadingAt" TIMESTAMP(3),
    "grossKg" DOUBLE PRECISION,
    "netKg" DOUBLE PRECISION,
    "percent" DOUBLE PRECISION,
    "tempC" DOUBLE PRECISION,
    "batteryPct" INTEGER,
    "batteryMv" INTEGER,
    "externalPower" BOOLEAN NOT NULL DEFAULT false,
    "rssi" INTEGER,
    "cfgApplied" INTEGER NOT NULL DEFAULT 0,
    "fw" TEXT,
    "uptimeSec" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_states_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "device_configs" (
    "deviceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "desired" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_configs_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "device_members" (
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "DeviceRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_members_pkey" PRIMARY KEY ("deviceId","userId")
);

-- CreateTable
CREATE TABLE "device_readings" (
    "id" BIGSERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "t" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seq" INTEGER NOT NULL,
    "grossKg" DOUBLE PRECISION NOT NULL,
    "netKg" DOUBLE PRECISION,
    "percent" DOUBLE PRECISION,
    "tempC" DOUBLE PRECISION,
    "settled" BOOLEAN NOT NULL DEFAULT true,
    "why" TEXT NOT NULL DEFAULT 'heartbeat',

    CONSTRAINT "device_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_reading_daily" (
    "deviceId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "startKg" DOUBLE PRECISION NOT NULL,
    "endKg" DOUBLE PRECISION NOT NULL,
    "minKg" DOUBLE PRECISION NOT NULL,
    "maxKg" DOUBLE PRECISION NOT NULL,
    "consumedKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "readings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "device_reading_daily_pkey" PRIMARY KEY ("deviceId","day")
);

-- CreateTable
CREATE TABLE "device_events" (
    "id" BIGSERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "t" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "code" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "args" JSONB,
    "status" "CommandStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedBy" TEXT,
    "idempotencyKey" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "result" TEXT,
    "detail" TEXT,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_alert_states" (
    "deviceId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "armed" BOOLEAN NOT NULL DEFAULT true,
    "firedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_alert_states_pkey" PRIMARY KEY ("deviceId","rule")
);

-- CreateIndex
CREATE INDEX "devices_ownerId_idx" ON "devices"("ownerId");

-- CreateIndex
CREATE INDEX "device_members_userId_idx" ON "device_members"("userId");

-- CreateIndex
CREATE INDEX "device_readings_deviceId_t_idx" ON "device_readings"("deviceId", "t");

-- CreateIndex
CREATE UNIQUE INDEX "device_readings_deviceId_seq_t_key" ON "device_readings"("deviceId", "seq", "t");

-- CreateIndex
CREATE INDEX "device_events_deviceId_t_idx" ON "device_events"("deviceId", "t");

-- CreateIndex
CREATE INDEX "device_events_code_t_idx" ON "device_events"("code", "t");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_requestedAt_idx" ON "device_commands"("deviceId", "requestedAt");

-- CreateIndex
CREATE INDEX "device_commands_status_expiresAt_idx" ON "device_commands"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_commands_deviceId_idempotencyKey_key" ON "device_commands"("deviceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_cylinderId_fkey" FOREIGN KEY ("cylinderId") REFERENCES "cylinder_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_states" ADD CONSTRAINT "device_states_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_configs" ADD CONSTRAINT "device_configs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_members" ADD CONSTRAINT "device_members_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_members" ADD CONSTRAINT "device_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_reading_daily" ADD CONSTRAINT "device_reading_daily_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_alert_states" ADD CONSTRAINT "device_alert_states_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

