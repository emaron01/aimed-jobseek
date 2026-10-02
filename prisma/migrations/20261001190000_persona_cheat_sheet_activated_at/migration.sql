-- Nullable: null means the persona is not on the Interview Cheat Sheet. No default and no backfill.
ALTER TABLE "Persona" ADD COLUMN "cheatSheetActivatedAt" TIMESTAMP(3);
