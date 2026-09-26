-- Persist which application-step results the seeker has already viewed so
-- "new" markers replace stacked ready banners. Existing applications start
-- with no markers until a new result arrives after first tracker load.
ALTER TABLE "Campaign" ADD COLUMN "workspaceSeenJson" JSONB;
