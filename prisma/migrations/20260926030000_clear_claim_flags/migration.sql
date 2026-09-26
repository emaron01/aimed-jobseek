-- Clear leftover claim flags so no existing record can render them,
-- then drop the unused columns.
UPDATE "ConsultationStatement" SET "claimFlagsJson" = NULL WHERE "claimFlagsJson" IS NOT NULL;
UPDATE "ApplicationSummary" SET "claimFlagsJson" = NULL WHERE "claimFlagsJson" IS NOT NULL;
UPDATE "ApplicationAsset" SET "claimFlagsJson" = NULL WHERE "claimFlagsJson" IS NOT NULL;
UPDATE "InterviewStageGuide" SET "claimFlagsJson" = NULL WHERE "claimFlagsJson" IS NOT NULL;

ALTER TABLE "ConsultationStatement" DROP COLUMN "claimFlagsJson";
ALTER TABLE "ApplicationSummary" DROP COLUMN "claimFlagsJson";
ALTER TABLE "ApplicationAsset" DROP COLUMN "claimFlagsJson";
ALTER TABLE "InterviewStageGuide" DROP COLUMN "claimFlagsJson";
