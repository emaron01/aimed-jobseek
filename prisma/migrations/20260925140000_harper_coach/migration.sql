-- AlterTable
ALTER TABLE "ConsultationSession" ADD COLUMN "briefingJson" JSONB;

-- AlterTable
ALTER TABLE "ConsultationTurn" ADD COLUMN "intent" TEXT;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "nextStepText" TEXT,
ADD COLUMN "nextStepStateKey" TEXT;

-- CreateEnum
CREATE TYPE "ApplicationPresentationPlanType" AS ENUM ('RESUME', 'COVER_LETTER');

-- CreateEnum
CREATE TYPE "ApplicationPresentationPlanStatus" AS ENUM ('DRAFT', 'ACCEPTED');

-- CreateTable
CREATE TABLE "ApplicationPresentationPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "ApplicationPresentationPlanType" NOT NULL,
    "status" "ApplicationPresentationPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "planJson" JSONB NOT NULL,
    "adjustmentNote" TEXT,
    "promptVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationPresentationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationPresentationPlan_campaignId_type_key" ON "ApplicationPresentationPlan"("campaignId", "type");

-- CreateIndex
CREATE INDEX "ApplicationPresentationPlan_organizationId_idx" ON "ApplicationPresentationPlan"("organizationId");

-- CreateIndex
CREATE INDEX "ApplicationPresentationPlan_campaignId_idx" ON "ApplicationPresentationPlan"("campaignId");

-- AddForeignKey
ALTER TABLE "ApplicationPresentationPlan" ADD CONSTRAINT "ApplicationPresentationPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationPresentationPlan" ADD CONSTRAINT "ApplicationPresentationPlan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
