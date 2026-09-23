-- Consultation sessions, evidence assessments, and the Personal Profile story bank.
-- Existing rows are unchanged. New tables only.

CREATE TYPE "ConsultationStatus" AS ENUM ('IN_PROGRESS', 'PAUSED', 'SKIPPED', 'DONE');
CREATE TYPE "ConsultationSpeaker" AS ENUM ('CONSULTANT', 'SEEKER');
CREATE TYPE "EvidenceStrength" AS ENUM ('STRONG', 'PARTIAL', 'NONE');
CREATE TYPE "GapStrategy" AS ENUM ('PROVE_WITH_STORY', 'REFRAME_ADJACENT', 'ACKNOWLEDGE');
CREATE TYPE "ConsultationProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');
CREATE TYPE "ConsultationProposalKind" AS ENUM ('FACT', 'STORY');

CREATE TABLE "ConsultationSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "status" "ConsultationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "promptVersion" TEXT NOT NULL,
  "coachNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationSession_campaignId_key" ON "ConsultationSession"("campaignId");
CREATE INDEX "ConsultationSession_organizationId_idx" ON "ConsultationSession"("organizationId");
CREATE INDEX "ConsultationSession_productId_idx" ON "ConsultationSession"("productId");

CREATE TABLE "ConsultationTurn" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "speaker" "ConsultationSpeaker" NOT NULL,
  "body" TEXT NOT NULL,
  "skipped" BOOLEAN NOT NULL DEFAULT false,
  "targetKey" TEXT,
  "followUp" BOOLEAN NOT NULL DEFAULT false,
  "seekerAuthored" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsultationTurn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationTurn_sessionId_sequence_key" ON "ConsultationTurn"("sessionId", "sequence");
CREATE INDEX "ConsultationTurn_organizationId_idx" ON "ConsultationTurn"("organizationId");
CREATE INDEX "ConsultationTurn_sessionId_idx" ON "ConsultationTurn"("sessionId");

CREATE TABLE "ConsultationAssessment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "targetKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "strength" "EvidenceStrength" NOT NULL,
  "supportingFactIds" JSONB NOT NULL,
  "strategy" "GapStrategy",
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultationAssessment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationAssessment_sessionId_targetKey_key" ON "ConsultationAssessment"("sessionId", "targetKey");
CREATE INDEX "ConsultationAssessment_organizationId_idx" ON "ConsultationAssessment"("organizationId");

CREATE TABLE "ConsultationProposal" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "turnId" TEXT NOT NULL,
  "status" "ConsultationProposalStatus" NOT NULL DEFAULT 'PENDING',
  "kind" "ConsultationProposalKind" NOT NULL,
  "text" TEXT NOT NULL,
  "storyJson" JSONB,
  "competencyLinks" JSONB,
  "profileItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultationProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsultationProposal_organizationId_idx" ON "ConsultationProposal"("organizationId");
CREATE INDEX "ConsultationProposal_sessionId_idx" ON "ConsultationProposal"("sessionId");
CREATE INDEX "ConsultationProposal_turnId_idx" ON "ConsultationProposal"("turnId");

CREATE TABLE "ProfileStory" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "situation" TEXT NOT NULL,
  "task" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "competencyLinks" JSONB NOT NULL,
  "consultationTurnId" TEXT NOT NULL,
  "seekerAuthored" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileStory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileStory_organizationId_idx" ON "ProfileStory"("organizationId");
CREATE INDEX "ProfileStory_productId_idx" ON "ProfileStory"("productId");
CREATE INDEX "ProfileStory_consultationTurnId_idx" ON "ProfileStory"("consultationTurnId");

ALTER TABLE "ConsultationSession" ADD CONSTRAINT "ConsultationSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationSession" ADD CONSTRAINT "ConsultationSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationTurn" ADD CONSTRAINT "ConsultationTurn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationTurn" ADD CONSTRAINT "ConsultationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConsultationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationAssessment" ADD CONSTRAINT "ConsultationAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationAssessment" ADD CONSTRAINT "ConsultationAssessment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConsultationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationProposal" ADD CONSTRAINT "ConsultationProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationProposal" ADD CONSTRAINT "ConsultationProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConsultationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationProposal" ADD CONSTRAINT "ConsultationProposal_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ConsultationTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileStory" ADD CONSTRAINT "ProfileStory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileStory" ADD CONSTRAINT "ProfileStory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
