-- PaidCallReceipt: durable fingerprint + last successful paid-call result.
CREATE TABLE "PaidCallReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaidCallReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaidCallReceipt_organizationId_operation_subjectKey_key"
ON "PaidCallReceipt"("organizationId", "operation", "subjectKey");

CREATE INDEX "PaidCallReceipt_organizationId_idx" ON "PaidCallReceipt"("organizationId");

ALTER TABLE "PaidCallReceipt"
ADD CONSTRAINT "PaidCallReceipt_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- One active ApplicationJob per org + campaign + type + target (null coalesced).
-- Matches findActiveJob soft-dedupe key (CHANGE 3 verified safe).
CREATE UNIQUE INDEX "ApplicationJob_active_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status IN ('PENDING', 'IN_PROGRESS');
