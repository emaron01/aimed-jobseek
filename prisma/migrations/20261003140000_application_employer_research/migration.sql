-- Tailored employer research for one application.
-- Additive only: existing CompanyResearch rows are not read or updated.
CREATE TABLE "ApplicationEmployerResearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CompanyResearchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "companySummary" TEXT,
    "whatTheySell" TEXT,
    "customerTypes" JSONB,
    "primaryMarkets" JSONB,
    "businessModel" TEXT,
    "companySizeContext" TEXT,
    "relevantTechnologies" JSONB,
    "hiringSignals" JSONB,
    "riskSignals" JSONB,
    "jobFocus" TEXT,
    "jobFocusDetail" TEXT,
    "identityAmbiguous" BOOLEAN NOT NULL DEFAULT false,
    "researchConfidence" "ResearchConfidence",
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "researchSources" JSONB,
    "promptVersion" TEXT,
    "anchorHost" TEXT,
    "inputFingerprint" TEXT,
    "researchedAt" TIMESTAMP(3),
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "aiModelUrlIdentifier" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "webSearchCallCount" INTEGER,
    "researchDurationMs" INTEGER,
    "searchStagesUsed" INTEGER,
    "researchStoppedReason" TEXT,
    "researchStageTimings" JSONB,
    "researchedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationEmployerResearch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationEmployerResearch_organizationId_campaignId_idx" ON "ApplicationEmployerResearch"("organizationId", "campaignId");

CREATE INDEX "ApplicationEmployerResearch_organizationId_companyId_idx" ON "ApplicationEmployerResearch"("organizationId", "companyId");

CREATE INDEX "ApplicationEmployerResearch_campaignId_idx" ON "ApplicationEmployerResearch"("campaignId");

CREATE INDEX "ApplicationEmployerResearch_researchedByUserId_idx" ON "ApplicationEmployerResearch"("researchedByUserId");

ALTER TABLE "ApplicationEmployerResearch" ADD CONSTRAINT "ApplicationEmployerResearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationEmployerResearch" ADD CONSTRAINT "ApplicationEmployerResearch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationEmployerResearch" ADD CONSTRAINT "ApplicationEmployerResearch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationEmployerResearch" ADD CONSTRAINT "ApplicationEmployerResearch_researchedByUserId_fkey" FOREIGN KEY ("researchedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
