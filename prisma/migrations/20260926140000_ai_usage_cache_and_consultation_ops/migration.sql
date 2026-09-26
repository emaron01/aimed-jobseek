ALTER TYPE "UsageCategory" ADD VALUE IF NOT EXISTS 'CONSULTATION';

ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'CONSULTATION';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'CONSULTATION_REPLY';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'APPLICATION_NEXT_STEP';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'APPLICATION_SUMMARY';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'INTERVIEW_GUIDE';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'HIRING_TEAM';
ALTER TYPE "UsageOperation" ADD VALUE IF NOT EXISTS 'CONTACT_PROFILE';

ALTER TABLE "UsageEvent" ADD COLUMN "cachedInputTokens" INTEGER;
ALTER TABLE "UsageEvent" ADD COLUMN "cacheWriteTokens" INTEGER;

ALTER TABLE "AiModelRate" ADD COLUMN "cachedInputPer1MUsd" DECIMAL(12,6) NOT NULL DEFAULT 0;
ALTER TABLE "AiModelRate" ADD COLUMN "cacheWritePer1MUsd" DECIMAL(12,6) NOT NULL DEFAULT 0;

UPDATE "AiModelRate"
SET
  "cachedInputPer1MUsd" = ROUND("inputPer1MUsd" * 0.1, 6),
  "cacheWritePer1MUsd" = ROUND("inputPer1MUsd" * 1.25, 6)
WHERE "cachedInputPer1MUsd" = 0 AND "cacheWritePer1MUsd" = 0;

INSERT INTO "AiModelRate" (
  "id",
  "provider",
  "model",
  "inputPer1MUsd",
  "cachedInputPer1MUsd",
  "cacheWritePer1MUsd",
  "outputPer1MUsd",
  "webSearchPerCallUsd",
  "effectiveFrom",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  'seed_openai_gpt56terra_20260101',
  'openai',
  'gpt-5.6-terra',
  2,
  0.2,
  2.5,
  12,
  0.01,
  TIMESTAMP '2026-01-01 00:00:00',
  'Seed: gpt-5.6-terra cached input $0.20/1M, cache write 1.25x input',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "AiModelRate"
  WHERE "provider" = 'openai'
    AND "model" = 'gpt-5.6-terra'
    AND "effectiveFrom" = TIMESTAMP '2026-01-01 00:00:00'
);
