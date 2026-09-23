-- Account templates and per-application Hiring Team roles.
-- Existing Persona rows stay product-scoped (campaignId null).

CREATE TABLE IF NOT EXISTS "PersonaTemplate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "templateKey" TEXT,
  "name" TEXT NOT NULL,
  "likelyTitles" JSONB,
  "department" TEXT,
  "whyThisRoleMatters" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonaTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PersonaTemplate_organizationId_templateKey_key"
  ON "PersonaTemplate"("organizationId", "templateKey");
CREATE INDEX IF NOT EXISTS "PersonaTemplate_organizationId_idx"
  ON "PersonaTemplate"("organizationId");

ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
ALTER TABLE "Persona" ADD COLUMN IF NOT EXISTS "personaTemplateId" TEXT;

CREATE INDEX IF NOT EXISTS "Persona_campaignId_idx" ON "Persona"("campaignId");
CREATE INDEX IF NOT EXISTS "Persona_organizationId_campaignId_idx"
  ON "Persona"("organizationId", "campaignId");
CREATE INDEX IF NOT EXISTS "Persona_personaTemplateId_idx" ON "Persona"("personaTemplateId");

DO $$ BEGIN
  ALTER TABLE "PersonaTemplate"
    ADD CONSTRAINT "PersonaTemplate_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Persona"
    ADD CONSTRAINT "Persona_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Persona"
    ADD CONSTRAINT "Persona_personaTemplateId_fkey"
    FOREIGN KEY ("personaTemplateId") REFERENCES "PersonaTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
