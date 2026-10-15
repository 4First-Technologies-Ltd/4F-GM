-- AlterTable
ALTER TABLE "branch_staff" ADD COLUMN "tokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "branch_staff_tokenHash_key" ON "branch_staff"("tokenHash");
