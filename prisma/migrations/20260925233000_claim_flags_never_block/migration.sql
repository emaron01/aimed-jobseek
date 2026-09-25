-- AlterTable
ALTER TABLE "ApplicationAsset" ADD COLUMN "claimFlagsJson" JSONB;

-- AlterTable
ALTER TABLE "ConsultationStatement" ADD COLUMN "claimFlagsJson" JSONB;

-- AlterTable
ALTER TABLE "ApplicationSummary" ADD COLUMN "claimFlagsJson" JSONB;

-- AlterTable
ALTER TABLE "InterviewStageGuide" ADD COLUMN "claimFlagsJson" JSONB;
