-- Product photo for marketplace listings (object key in the public R2 bucket).
ALTER TABLE "gas_listings" ADD COLUMN "imageKey" TEXT;
