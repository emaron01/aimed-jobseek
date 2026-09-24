-- AlterEnum
CREATE TYPE "IdentityConfirmation" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "JobRequirement" ADD COLUMN "suppliedEmployerWebsite" TEXT,
ADD COLUMN "identityVerificationJson" JSONB,
ADD COLUMN "identityConfirmation" "IdentityConfirmation" NOT NULL DEFAULT 'PENDING';
