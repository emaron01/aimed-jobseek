-- Nullable column. Existing rows stay null until the backfill below.
ALTER TABLE "Campaign" ADD COLUMN "resumeStatementPicksJson" JSONB;

-- Carry over picks already stored on the workspace seen document, including an empty array.
UPDATE "Campaign"
SET "resumeStatementPicksJson" = "workspaceSeenJson"->'resumeStatementPickIds'
WHERE "workspaceSeenJson" ? 'resumeStatementPickIds'
  AND jsonb_typeof("workspaceSeenJson"->'resumeStatementPickIds') = 'array';

-- The seen document is no longer the store. Other seen keys stay.
UPDATE "Campaign"
SET "workspaceSeenJson" = "workspaceSeenJson" - 'resumeStatementPickIds'
WHERE "workspaceSeenJson" ? 'resumeStatementPickIds';
