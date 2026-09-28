-- Serialize same-key ApplicationJobs: at most one PENDING and one IN_PROGRESS per key.
DROP INDEX IF EXISTS "ApplicationJob_active_org_campaign_type_target_uidx";

CREATE UNIQUE INDEX "ApplicationJob_pending_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'PENDING';

CREATE UNIQUE INDEX "ApplicationJob_in_progress_org_campaign_type_target_uidx"
ON "ApplicationJob" ("organizationId", "campaignId", "type", (COALESCE("targetId", '')))
WHERE status = 'IN_PROGRESS';
