-- Existing applications still show fail-closed job errors after flag-and-save.
-- Those checks no longer fail work; supersede matching rows so the workspace
-- reflects the current product behavior. Distinctive phrases only.
UPDATE "ApplicationJob"
SET
  status = 'COMPLETED',
  error = NULL,
  "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status = 'FAILED'
  AND error IS NOT NULL
  AND (
    error ILIKE '%The asset was not saved because its claims did not pass verification%'
    OR error ILIKE '%Retry after reviewing the violations.%'
    OR error ILIKE '%This version was not saved because some claims did not match their sources.%'
    OR error ILIKE '%Consultation planning did not return a usable plan. Retry consultation.%'
    OR error ILIKE '%Consultation answer analysis did not return a fully grounded story.%'
  );

UPDATE "ConsultationSession"
SET
  "generationError" = NULL,
  "generationStatus" = CASE
    WHEN "generationStatus" = 'FAILED' THEN 'READY'
    ELSE "generationStatus"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "generationError" IS NOT NULL
  AND (
    "generationError" ILIKE '%The asset was not saved because its claims did not pass verification%'
    OR "generationError" ILIKE '%Retry after reviewing the violations.%'
    OR "generationError" ILIKE '%This version was not saved because some claims did not match their sources.%'
    OR "generationError" ILIKE '%Consultation planning did not return a usable plan. Retry consultation.%'
    OR "generationError" ILIKE '%Consultation answer analysis did not return a fully grounded story.%'
  );
