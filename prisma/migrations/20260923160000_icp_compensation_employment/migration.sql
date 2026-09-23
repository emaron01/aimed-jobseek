-- Target Employer compensation and employment type. All amounts stay null on existing rows.
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "targetAnnualEarningsMin" DECIMAL(14,2);
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "targetAnnualEarningsTarget" DECIMAL(14,2);
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "targetHourlyRateMin" DECIMAL(14,2);
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "targetHourlyRateTarget" DECIMAL(14,2);
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "compensationCurrency" TEXT;
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "employmentTypes" JSONB;
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "annualEarningsMinimumRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "hourlyRateMinimumRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Icp" ADD COLUMN IF NOT EXISTS "employmentTypeRequired" BOOLEAN NOT NULL DEFAULT false;
