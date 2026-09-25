-- AlterTable
ALTER TABLE "CampaignContact" ADD COLUMN "personPrepStatus" TEXT;
ALTER TABLE "CampaignContact" ADD COLUMN "personPrepOpening" TEXT;
ALTER TABLE "CampaignContact" ADD COLUMN "personPrepAnswersJson" JSONB;
ALTER TABLE "CampaignContact" ADD COLUMN "personPrepOfferedAt" TIMESTAMP(3);
