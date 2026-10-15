-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "openingHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "gas_listings" ADD COLUMN "branchId" TEXT;
ALTER TABLE "orders" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE INDEX "branches_vendorId_idx" ON "branches"("vendorId");
CREATE INDEX "branches_state_city_idx" ON "branches"("state", "city");
CREATE INDEX "gas_listings_branchId_idx" ON "gas_listings"("branchId");
CREATE INDEX "orders_branchId_idx" ON "orders"("branchId");

-- Exactly one main branch per vendor (Prisma cannot express partial indexes).
CREATE UNIQUE INDEX "branches_one_main_per_vendor" ON "branches"("vendorId") WHERE "isMain";

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gas_listings" ADD CONSTRAINT "gas_listings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one main branch per existing vendor, from its current location.
INSERT INTO "branches" ("id", "vendorId", "name", "address", "state", "city", "lat", "lng", "phone", "isMain", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v."id", 'Main branch', v."businessAddress", v."state", v."city", v."lat", v."lng", v."phone", true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "vendor_profiles" v
WHERE NOT EXISTS (SELECT 1 FROM "branches" b WHERE b."vendorId" = v."id");

UPDATE "gas_listings" l SET "branchId" = b."id"
FROM "branches" b
WHERE b."vendorId" = l."vendorId" AND b."isMain" AND l."branchId" IS NULL;

UPDATE "orders" o SET "branchId" = l."branchId"
FROM "gas_listings" l
WHERE o."listingId" = l."id" AND o."branchId" IS NULL AND l."branchId" IS NOT NULL;

-- Orders whose listing was deleted: fall back to the vendor's main branch.
UPDATE "orders" o SET "branchId" = b."id"
FROM "branches" b
WHERE o."branchId" IS NULL AND o."vendorId" IS NOT NULL AND b."vendorId" = o."vendorId" AND b."isMain";
