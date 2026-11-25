-- Backfill for the rider job pool (see 20261125000000_rider_job_pool).

-- Approximate lifecycle timestamps for existing orders (there was no status-change time before).
UPDATE "orders" SET "confirmedAt" = "updatedAt" WHERE "status" IN ('CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED') AND "confirmedAt" IS NULL;
UPDATE "orders" SET "deliveredAt" = "updatedAt" WHERE "status" = 'DELIVERED' AND "deliveredAt" IS NULL;
UPDATE "orders" SET "acceptedAt" = COALESCE("assignedAt", "updatedAt"), "pickedUpAt" = "updatedAt"
  WHERE "status" = 'OUT_FOR_DELIVERY';

-- A paid order a vendor already put a rider on was, in effect, accepted: it becomes a claimed job.
UPDATE "orders" SET "status" = 'ACCEPTED', "acceptedAt" = "assignedAt", "poolEnteredAt" = "assignedAt"
  WHERE "status" = 'CONFIRMED' AND "riderId" IS NOT NULL;

-- Platform (4FG Monitor) orders have no vendor to accept them: straight into the pool.
UPDATE "orders" SET "status" = 'ACCEPTED', "acceptedAt" = now(), "poolEnteredAt" = now()
  WHERE "status" = 'CONFIRMED' AND "vendorId" IS NULL;

-- Orders still to be delivered need a delivery PIN.
UPDATE "orders" SET "deliveryPin" = lpad(floor(random() * 10000)::int::text, 4, '0')
  WHERE "status" IN ('PENDING', 'CONFIRMED', 'ACCEPTED', 'OUT_FOR_DELIVERY') AND "deliveryPin" IS NULL;
