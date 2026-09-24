-- Whether a contact's Hiring Team role is confirmed (posting-named or seeker-confirmed).
ALTER TABLE "CampaignContact" ADD COLUMN "roleConfirmed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CampaignContact" AS membership
SET "roleConfirmed" = true
FROM "Contact" AS contact
WHERE membership."contactId" = contact.id
  AND contact."rawData" IS NOT NULL
  AND contact."rawData"->>'source' = 'POSTING';
