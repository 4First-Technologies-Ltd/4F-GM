-- CreateTable
CREATE TABLE "rider_bank_accounts" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "paystackRecipientCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rider_bank_accounts_riderId_key" ON "rider_bank_accounts"("riderId");

-- AddForeignKey
ALTER TABLE "rider_bank_accounts" ADD CONSTRAINT "rider_bank_accounts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "rider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
