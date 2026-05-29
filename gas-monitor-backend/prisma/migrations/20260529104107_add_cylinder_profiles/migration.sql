-- CreateTable
CREATE TABLE "cylinder_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeKg" DOUBLE PRECISION NOT NULL,
    "customSizeLabel" TEXT,
    "imageKey" TEXT NOT NULL DEFAULT '12.5kg',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cylinder_profiles_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "cylinder_profiles" ADD CONSTRAINT "cylinder_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
