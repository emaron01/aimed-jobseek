CREATE TYPE "ConsultationGenerationStatus" AS ENUM ('READY', 'GENERATING', 'FAILED');

ALTER TABLE "ConsultationSession"
ADD COLUMN "generationStatus" "ConsultationGenerationStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN "generationError" TEXT;

ALTER TABLE "ConsultationTurn"
ADD COLUMN "analysisJson" JSONB;

ALTER TABLE "ConsultationAssessment"
ADD COLUMN "explanation" TEXT,
ADD COLUMN "strategyText" TEXT,
ADD COLUMN "verificationJson" JSONB,
ADD COLUMN "experienceCalculationJson" JSONB;
