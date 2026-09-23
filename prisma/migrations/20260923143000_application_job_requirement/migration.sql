-- Application slice: parsed job requirement, employer fit, hiring signals.
-- Additive only. Existing campaigns and research rows are unchanged.

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'JOB_REQUIREMENT_PARSE';

ALTER TABLE "CompanyResearch" ADD COLUMN IF NOT EXISTS "hiringSignals" JSONB;

DO $$ BEGIN
  CREATE TYPE "JobEmployerDisposition" AS ENUM ('IDENTIFIED', 'AMBIGUOUS', 'UNDISCLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "JobRequirement" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "postingUrl" TEXT,
  "title" TEXT,
  "companyName" TEXT,
  "location" TEXT,
  "workArrangement" TEXT,
  "employmentType" TEXT,
  "seniority" TEXT,
  "compensationRange" TEXT,
  "reportingLine" TEXT,
  "responsibilities" JSONB,
  "requiredItems" JSONB,
  "preferredItems" JSONB,
  "scorecardJson" JSONB NOT NULL,
  "employerDisposition" "JobEmployerDisposition" NOT NULL DEFAULT 'IDENTIFIED',
  "employerSkipReason" TEXT,
  "suppliedEmployerName" TEXT,
  "companyId" TEXT,
  "parserPromptVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobRequirement_campaignId_key" ON "JobRequirement"("campaignId");
CREATE INDEX IF NOT EXISTS "JobRequirement_organizationId_idx" ON "JobRequirement"("organizationId");
CREATE INDEX IF NOT EXISTS "JobRequirement_companyId_idx" ON "JobRequirement"("companyId");

CREATE TABLE IF NOT EXISTS "ApplicationFit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "icpId" TEXT NOT NULL,
  "interpretationPromptVersion" TEXT,
  "bucket" "QualificationBucket" NOT NULL,
  "outcomesJson" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL,
  "companyResearchId" TEXT,
  "companyResearchUpdatedAt" TIMESTAMP(3),
  "icpUpdatedAt" TIMESTAMP(3) NOT NULL,
  "stale" BOOLEAN NOT NULL DEFAULT false,
  "staleReason" TEXT,
  "overrideBucket" "QualificationBucket",
  "overrideReason" TEXT,
  "overriddenAt" TIMESTAMP(3),
  "overriddenByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationFit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApplicationFit_campaignId_key" ON "ApplicationFit"("campaignId");
CREATE INDEX IF NOT EXISTS "ApplicationFit_organizationId_idx" ON "ApplicationFit"("organizationId");
CREATE INDEX IF NOT EXISTS "ApplicationFit_icpId_idx" ON "ApplicationFit"("icpId");
CREATE INDEX IF NOT EXISTS "ApplicationFit_overriddenByUserId_idx" ON "ApplicationFit"("overriddenByUserId");

DO $$ BEGIN
  ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JobRequirement" ADD CONSTRAINT "JobRequirement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApplicationFit" ADD CONSTRAINT "ApplicationFit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApplicationFit" ADD CONSTRAINT "ApplicationFit_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApplicationFit" ADD CONSTRAINT "ApplicationFit_icpId_fkey" FOREIGN KEY ("icpId") REFERENCES "Icp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ApplicationFit" ADD CONSTRAINT "ApplicationFit_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
