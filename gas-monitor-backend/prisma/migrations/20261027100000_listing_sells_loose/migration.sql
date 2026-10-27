-- AlterTable
-- Off for every existing listing: a vendor opts in to selling loose gas by kg or amount.
ALTER TABLE "gas_listings" ADD COLUMN "sellsLoose" BOOLEAN NOT NULL DEFAULT false;
