CREATE TYPE "ConsultationStatementKind" AS ENUM ('INTERVIEW_ANSWER', 'RESUME_BULLET');
CREATE TYPE "ConsultationStatementStatus" AS ENUM ('DRAFT', 'APPROVED');

CREATE TABLE "ConsultationStatement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "kind" "ConsultationStatementKind" NOT NULL,
    "status" "ConsultationStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "groundingJson" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationStatement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationStatement_turnId_kind_key"
ON "ConsultationStatement"("turnId", "kind");
CREATE INDEX "ConsultationStatement_organizationId_idx"
ON "ConsultationStatement"("organizationId");
CREATE INDEX "ConsultationStatement_sessionId_idx"
ON "ConsultationStatement"("sessionId");
CREATE INDEX "ConsultationStatement_status_idx"
ON "ConsultationStatement"("status");

ALTER TABLE "ConsultationStatement"
ADD CONSTRAINT "ConsultationStatement_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationStatement"
ADD CONSTRAINT "ConsultationStatement_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ConsultationSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultationStatement"
ADD CONSTRAINT "ConsultationStatement_turnId_fkey"
FOREIGN KEY ("turnId") REFERENCES "ConsultationTurn"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfileStory"
ADD COLUMN "verbatimAnswer" TEXT,
ADD COLUMN "interviewAnswer" TEXT,
ADD COLUMN "resumeBullet" TEXT,
ADD COLUMN "interviewAnswerApprovedAt" TIMESTAMP(3),
ADD COLUMN "resumeBulletApprovedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ProfileStory"
ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ConsultationTurn"
ADD COLUMN "questionContextJson" JSONB;

CREATE TABLE "ApplicationSummary" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "ConsultationGenerationStatus" NOT NULL DEFAULT 'GENERATING',
    "guidanceJson" JSONB,
    "sourceHash" TEXT,
    "promptVersion" TEXT NOT NULL,
    "generationError" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationSummary_campaignId_key"
ON "ApplicationSummary"("campaignId");
CREATE INDEX "ApplicationSummary_organizationId_idx"
ON "ApplicationSummary"("organizationId");
CREATE INDEX "ApplicationSummary_status_idx"
ON "ApplicationSummary"("status");

ALTER TABLE "ApplicationSummary"
ADD CONSTRAINT "ApplicationSummary_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationSummary"
ADD CONSTRAINT "ApplicationSummary_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
