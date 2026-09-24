-- AlterEnum
ALTER TYPE "ApplicationOutreachPurpose" ADD VALUE 'THANK_YOU';
ALTER TYPE "ApplicationOutreachPurpose" ADD VALUE 'CHECK_IN';

-- CreateEnum
CREATE TYPE "ApplicationProgress" AS ENUM ('APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewStageType" AS ENUM ('RECRUITER_SCREEN', 'HIRING_MANAGER', 'PANEL_COMPETENCY', 'EXECUTIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "InterviewFormat" AS ENUM ('PHONE', 'VIDEO', 'ONSITE');

-- CreateEnum
CREATE TYPE "InterviewStageOutcome" AS ENUM ('ADVANCED', 'REJECTED', 'WITHDRAWN', 'OFFER', 'COMPLETED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "applicationProgress" "ApplicationProgress";

UPDATE "Campaign"
SET "applicationProgress" = 'APPLIED'
WHERE "appliedAt" IS NOT NULL AND "applicationProgress" IS NULL;

-- AlterTable
ALTER TABLE "OrganizationCadencePolicy"
ADD COLUMN "interviewThankYouHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN "interviewCheckInBusinessDays" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "ApplicationAsset" ADD COLUMN "interviewStageId" TEXT;

-- CreateTable
CREATE TABLE "InterviewStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "type" "InterviewStageType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "format" "InterviewFormat" NOT NULL,
    "notesBefore" TEXT,
    "notesAfter" TEXT,
    "expectedDecisionAt" TIMESTAMP(3),
    "outcome" "InterviewStageOutcome",
    "consultationOfferJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStageInterviewer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewStageInterviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewStageGuide" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "status" "ConsultationGenerationStatus" NOT NULL DEFAULT 'GENERATING',
    "clarifyingQuestionsJson" JSONB,
    "clarifyingAnswersJson" JSONB,
    "clarifyingSkipped" BOOLEAN NOT NULL DEFAULT false,
    "contentJson" JSONB,
    "sourceHash" TEXT,
    "promptVersion" TEXT NOT NULL,
    "generationError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewStageGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewStage_campaignId_sortOrder_key" ON "InterviewStage"("campaignId", "sortOrder");
CREATE INDEX "InterviewStage_organizationId_idx" ON "InterviewStage"("organizationId");
CREATE INDEX "InterviewStage_campaignId_idx" ON "InterviewStage"("campaignId");
CREATE INDEX "InterviewStage_scheduledAt_idx" ON "InterviewStage"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewStageInterviewer_stageId_contactId_key" ON "InterviewStageInterviewer"("stageId", "contactId");
CREATE INDEX "InterviewStageInterviewer_organizationId_idx" ON "InterviewStageInterviewer"("organizationId");
CREATE INDEX "InterviewStageInterviewer_contactId_idx" ON "InterviewStageInterviewer"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewStageGuide_stageId_key" ON "InterviewStageGuide"("stageId");
CREATE INDEX "InterviewStageGuide_organizationId_idx" ON "InterviewStageGuide"("organizationId");
CREATE INDEX "InterviewStageGuide_status_idx" ON "InterviewStageGuide"("status");

-- CreateIndex
CREATE INDEX "ApplicationAsset_interviewStageId_idx" ON "ApplicationAsset"("interviewStageId");

-- AddForeignKey
ALTER TABLE "InterviewStage" ADD CONSTRAINT "InterviewStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewStage" ADD CONSTRAINT "InterviewStage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewStageInterviewer" ADD CONSTRAINT "InterviewStageInterviewer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewStageInterviewer" ADD CONSTRAINT "InterviewStageInterviewer_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "InterviewStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewStageInterviewer" ADD CONSTRAINT "InterviewStageInterviewer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewStageGuide" ADD CONSTRAINT "InterviewStageGuide_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewStageGuide" ADD CONSTRAINT "InterviewStageGuide_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "InterviewStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_interviewStageId_fkey" FOREIGN KEY ("interviewStageId") REFERENCES "InterviewStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
