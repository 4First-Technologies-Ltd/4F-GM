-- Saved items: a signed-in user can save marketplace listings to come back to.

-- CreateTable
CREATE TABLE "saved_listings" (
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateIndex
CREATE INDEX "saved_listings_userId_createdAt_idx" ON "saved_listings"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "gas_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
