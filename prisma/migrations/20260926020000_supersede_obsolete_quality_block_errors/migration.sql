-- Leftover quality-block errors still render on existing applications after
-- flag-and-save. Clear matching generation errors so the current product
-- behavior is what seekers see. Distinctive phrases only.
UPDATE "ApplicationJob"
SET
  status = 'COMPLETED',
  error = NULL,
  "completedAt" = COALESCE("completedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status = 'FAILED'
  AND error IS NOT NULL
  AND (
    error ILIKE '%did not pass checks%'
    OR error ILIKE '%not enough to save%'
    OR error ILIKE '%did not pass verification%'
    OR error ILIKE '%could not be grounded%'
    OR error ILIKE '%Clarifying questions could not be written.%'
    OR error ILIKE '%Thank-you questions could not be written.%'
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
    "generationError" ILIKE '%did not pass checks%'
    OR "generationError" ILIKE '%not enough to save%'
    OR "generationError" ILIKE '%did not pass verification%'
    OR "generationError" ILIKE '%could not be grounded%'
    OR "generationError" ILIKE '%Clarifying questions could not be written.%'
    OR "generationError" ILIKE '%Thank-you questions could not be written.%'
  );

UPDATE "ApplicationSummary"
SET
  "generationError" = NULL,
  status = CASE
    WHEN status = 'FAILED' AND "guidanceJson" IS NOT NULL THEN 'READY'
    ELSE status
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "generationError" IS NOT NULL
  AND (
    "generationError" ILIKE '%did not pass checks%'
    OR "generationError" ILIKE '%not enough to save%'
    OR "generationError" ILIKE '%did not pass verification%'
    OR "generationError" ILIKE '%could not be grounded%'
    OR "generationError" ILIKE '%Application Summary guidance%'
    OR "generationError" ILIKE '%Interview Cheat Sheet guidance did not pass checks%'
  );

UPDATE "InterviewStageGuide"
SET
  "generationError" = NULL,
  status = CASE
    WHEN status = 'FAILED' AND "contentJson" IS NOT NULL THEN 'READY'
    ELSE status
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "generationError" IS NOT NULL
  AND (
    "generationError" ILIKE '%did not pass checks%'
    OR "generationError" ILIKE '%not enough to save%'
    OR "generationError" ILIKE '%did not pass verification%'
    OR "generationError" ILIKE '%could not be grounded%'
    OR "generationError" ILIKE '%Clarifying questions could not be written.%'
  );
