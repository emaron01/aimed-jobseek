CREATE TYPE "ApplicationAssetType" AS ENUM ('RESUME', 'COVER_LETTER');
CREATE TYPE "ApplicationAssetStatus" AS ENUM ('DRAFT', 'APPROVED');
ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'ASSET_GENERATION';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'APPLICATION_ASSET_GENERATION';

CREATE TABLE "ApplicationAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "ApplicationAssetType" NOT NULL,
    "personaId" TEXT,
    "version" INTEGER NOT NULL,
    "contentJson" JSONB NOT NULL,
    "claimTraceJson" JSONB NOT NULL,
    "guidance" TEXT,
    "promptVersion" TEXT NOT NULL,
    "status" "ApplicationAssetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationAsset_campaignId_type_version_key"
ON "ApplicationAsset"("campaignId", "type", "version");
CREATE INDEX "ApplicationAsset_organizationId_idx"
ON "ApplicationAsset"("organizationId");
CREATE INDEX "ApplicationAsset_campaignId_type_idx"
ON "ApplicationAsset"("campaignId", "type");
CREATE INDEX "ApplicationAsset_personaId_idx"
ON "ApplicationAsset"("personaId");
CREATE INDEX "ApplicationAsset_status_idx"
ON "ApplicationAsset"("status");

ALTER TABLE "ApplicationAsset"
ADD CONSTRAINT "ApplicationAsset_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationAsset"
ADD CONSTRAINT "ApplicationAsset_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationAsset"
ADD CONSTRAINT "ApplicationAsset_personaId_fkey"
FOREIGN KEY ("personaId") REFERENCES "Persona"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
