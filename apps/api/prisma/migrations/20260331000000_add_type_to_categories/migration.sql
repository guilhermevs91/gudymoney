-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE', 'BOTH');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "type" "CategoryType" NOT NULL DEFAULT 'BOTH';
