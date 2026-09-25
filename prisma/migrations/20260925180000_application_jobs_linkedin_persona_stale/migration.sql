-- Application-scoped generation queue, LinkedIn paste on roster contacts,
-- and stale markers for built Hiring Team personas.

CREATE TYPE "ApplicationJobType" AS ENUM (
  'HIRING_TEAM_IDENTIFY',
  'HIRING_TEAM_BUILD',
  'CONTACT_PROFILE',
  'CONSULTATION',
  'RESUME',
  'COVER_LETTER',
  'OUTREACH',
  'INTERVIEW_GUIDE',
  'APPLICATION_SUMMARY',
  'NEXT_STEP'
);

CREATE TYPE "ApplicationJobStatus" AS ENUM (
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "ApplicationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "ApplicationJobType" NOT NULL,
    "status" "ApplicationJobStatus" NOT NULL DEFAULT 'PENDING',
    "targetId" TEXT,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB,
    "initiatedByUserId" TEXT,
    "workerHeartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationJob_organizationId_idx" ON "ApplicationJob"("organizationId");
CREATE INDEX "ApplicationJob_campaignId_idx" ON "ApplicationJob"("campaignId");
CREATE INDEX "ApplicationJob_organizationId_campaignId_type_status_idx" ON "ApplicationJob"("organizationId", "campaignId", "type", "status");
CREATE INDEX "ApplicationJob_campaignId_type_targetId_status_idx" ON "ApplicationJob"("campaignId", "type", "targetId", "status");
CREATE INDEX "ApplicationJob_status_workerHeartbeatAt_idx" ON "ApplicationJob"("status", "workerHeartbeatAt");
CREATE INDEX "ApplicationJob_initiatedByUserId_idx" ON "ApplicationJob"("initiatedByUserId");

ALTER TABLE "ApplicationJob" ADD CONSTRAINT "ApplicationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationJob" ADD CONSTRAINT "ApplicationJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationJob" ADD CONSTRAINT "ApplicationJob_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Persona" ADD COLUMN "staleAt" TIMESTAMP(3);
ALTER TABLE "Persona" ADD COLUMN "staleReason" TEXT;

ALTER TABLE "CampaignContact" ADD COLUMN "linkedInProfileText" TEXT;
ALTER TABLE "CampaignContact" ADD COLUMN "linkedInExtractedJson" JSONB;
ALTER TABLE "CampaignContact" ADD COLUMN "individualProfileJson" JSONB;
ALTER TABLE "CampaignContact" ADD COLUMN "individualProfileStatus" "ApplicationJobStatus";
ALTER TABLE "CampaignContact" ADD COLUMN "individualProfileError" TEXT;
