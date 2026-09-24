-- Application reminder cadence (null = no reminder; never treat blank as zero).
ALTER TABLE "OrganizationCadencePolicy" ADD COLUMN "reminderDay3" INTEGER DEFAULT 3;
ALTER TABLE "OrganizationCadencePolicy" ADD COLUMN "reminderDay7" INTEGER DEFAULT 7;
ALTER TABLE "OrganizationCadencePolicy" ADD COLUMN "reminderEmail4Days" INTEGER;
ALTER TABLE "OrganizationCadencePolicy" ADD COLUMN "reminderRepeatDays" INTEGER;

UPDATE "OrganizationCadencePolicy"
SET "reminderDay3" = 3, "reminderDay7" = 7
WHERE "reminderDay3" IS NULL OR "reminderDay7" IS NULL;

-- Applied date on each application.
ALTER TABLE "Campaign" ADD COLUMN "appliedAt" TIMESTAMP(3);

-- Named contacts captured from the posting (FACT).
ALTER TABLE "JobRequirement" ADD COLUMN "namedContactsJson" JSONB;

-- Outreach asset types and follow-up purpose.
ALTER TYPE "ApplicationAssetType" ADD VALUE IF NOT EXISTS 'EMAIL';
ALTER TYPE "ApplicationAssetType" ADD VALUE IF NOT EXISTS 'LINKEDIN_CONNECTION_NOTE';
ALTER TYPE "ApplicationAssetType" ADD VALUE IF NOT EXISTS 'LINKEDIN_INMAIL';

CREATE TYPE "ApplicationOutreachPurpose" AS ENUM ('PROACTIVE', 'FOLLOW_UP');

ALTER TABLE "ApplicationAsset" ADD COLUMN "contactId" TEXT;
ALTER TABLE "ApplicationAsset" ADD COLUMN "purpose" "ApplicationOutreachPurpose";
ALTER TABLE "ApplicationAsset" ADD COLUMN "followUpToAssetId" TEXT;
ALTER TABLE "ApplicationAsset" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "ApplicationAsset" ADD COLUMN "emailLength" "EmailLength";
ALTER TABLE "ApplicationAsset" ADD COLUMN "groupKey" TEXT NOT NULL DEFAULT 'default';

UPDATE "ApplicationAsset" SET "groupKey" = "type" WHERE "groupKey" = 'default';

DROP INDEX IF EXISTS "ApplicationAsset_campaignId_type_version_key";
CREATE UNIQUE INDEX "ApplicationAsset_campaignId_groupKey_version_key" ON "ApplicationAsset"("campaignId", "groupKey", "version");
CREATE INDEX "ApplicationAsset_campaignId_groupKey_idx" ON "ApplicationAsset"("campaignId", "groupKey");
CREATE INDEX "ApplicationAsset_contactId_idx" ON "ApplicationAsset"("contactId");
CREATE INDEX "ApplicationAsset_followUpToAssetId_idx" ON "ApplicationAsset"("followUpToAssetId");
CREATE INDEX "ApplicationAsset_sentAt_idx" ON "ApplicationAsset"("sentAt");

ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationAsset" ADD CONSTRAINT "ApplicationAsset_followUpToAssetId_fkey" FOREIGN KEY ("followUpToAssetId") REFERENCES "ApplicationAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
