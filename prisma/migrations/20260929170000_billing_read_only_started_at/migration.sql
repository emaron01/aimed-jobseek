-- Account lifecycle B3: 30-day read-only window clock (nullable; existing rows stay not read-only).
ALTER TABLE "OrganizationBillingProfile" ADD COLUMN "readOnlyStartedAt" TIMESTAMP(3);
