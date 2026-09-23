-- Records why interpretation downgraded a proposed isRequired or isDisqualifier flag.
-- Existing rows stay null: no backfill, and scoring keeps the stored flags.

ALTER TABLE "IcpCriterion"
  ADD COLUMN IF NOT EXISTS "strengthAdjustment" TEXT;
