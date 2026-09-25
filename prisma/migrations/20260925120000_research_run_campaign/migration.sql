-- Application employer research uses the same ResearchRun queue as list batches.
-- List runs keep contactListId; application runs set campaignId and leave contactListId null.

ALTER TABLE "ResearchRun" ALTER COLUMN "contactListId" DROP NOT NULL;

ALTER TABLE "ResearchRun" ADD COLUMN "campaignId" TEXT;

ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_scope_check"
CHECK (
  ("contactListId" IS NOT NULL AND "campaignId" IS NULL)
  OR
  ("contactListId" IS NULL AND "campaignId" IS NOT NULL)
);

CREATE UNIQUE INDEX "ResearchRun_campaignId_active_key"
ON "ResearchRun" ("campaignId")
WHERE "status" IN ('PENDING', 'IN_PROGRESS') AND "campaignId" IS NOT NULL;

CREATE INDEX "ResearchRun_campaignId_idx" ON "ResearchRun"("campaignId");

CREATE INDEX "ResearchRun_organizationId_campaignId_status_idx"
ON "ResearchRun"("organizationId", "campaignId", "status");

ALTER TABLE "ResearchRun" ADD CONSTRAINT "ResearchRun_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
