import { isInterpretationAiConfigured } from "@/lib/ai/config";
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import { getInterpretationAiProvider } from "@/lib/ai/provider";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import type { AiCallUsageContext } from "@/lib/ai/types";
import { aiCallTracking } from "@/lib/usage/ai-call";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { buildJobRequirementMessages } from "@/lib/job-requirement/prompt";
import { jobRequirementAiResultSchema } from "@/lib/job-requirement/schema";
import {
  JOB_REQUIREMENT_PROMPT_VERSION,
  type ParsedJobRequirement,
} from "@/lib/job-requirement/types";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export const JOB_REQUIREMENT_PARSE_OPERATION = "JOB_REQUIREMENT_PARSE" as const;
export const JOB_REQUIREMENT_SCHEMA_NAME = "job_requirement_parse";

/** Canonical fingerprint for job posting parse (Batch Phase 2a). */
export function jobRequirementParseFingerprint(input: {
  rawText: string;
  seekerLearnedNotes?: string | null;
}): string {
  return fingerprintPaidCallInputs({
    promptVersion: JOB_REQUIREMENT_PROMPT_VERSION,
    schemaName: JOB_REQUIREMENT_SCHEMA_NAME,
    postingText: input.rawText.trim(),
    seekerLearnedNotes: input.seekerLearnedNotes?.trim() || null,
  });
}

function normalizeFromStored(stored: unknown, posting: string): ParsedJobRequirement {
  const parsed = jobRequirementAiResultSchema.safeParse(stored);
  if (parsed.success) {
    const model = parsed.data;
    return normalizeParsedJobRequirement(
      {
        ...model,
        scorecard: {
          mission: model.scorecard.missionText
            ? {
                text: model.scorecard.missionText,
                inferred: model.scorecard.missionInferred,
              }
            : null,
          outcomes: model.scorecard.outcomes,
          competencies: model.scorecard.competencies,
        },
      },
      posting,
    );
  }
  // Stored already-normalized ParsedJobRequirement from a prior gate write.
  const asNormalized = stored as ParsedJobRequirement;
  if (
    asNormalized &&
    typeof asNormalized === "object" &&
    Array.isArray(asNormalized.requiredItems) &&
    asNormalized.scorecard &&
    typeof asNormalized.scorecard === "object"
  ) {
    return asNormalized;
  }
  throw new Error("Stored job parse result is not usable.");
}

function isUsableParsedRequirement(value: ParsedJobRequirement): boolean {
  return (
    Array.isArray(value.requiredItems) &&
    Array.isArray(value.responsibilities) &&
    value.scorecard != null &&
    typeof value.scorecard === "object"
  );
}

export async function interpretJobPosting(
  rawText: string,
  usage?: AiCallUsageContext,
  seekerLearnedNotes?: string | null,
): Promise<ParsedJobRequirement> {
  const posting = rawText.trim();
  if (!posting) {
    throw new TenantError(
      `Paste a job posting before creating ${vocab.campaign.aSingular}.`,
    );
  }
  if (!isInterpretationAiConfigured()) {
    throw new TenantError(
      `Parsing is not configured, so this ${vocab.campaign.singular} was not created.`,
    );
  }

  const fingerprint = jobRequirementParseFingerprint({
    rawText: posting,
    seekerLearnedNotes,
  });
  const organizationId = usage?.organizationId;
  if (!organizationId) {
    return callJobParseProvider(posting, seekerLearnedNotes, usage);
  }
  const subjectKey =
    usage.campaignId?.trim() || `content:${fingerprint}`;

  const { data } = await runPaidStructuredCall<ParsedJobRequirement>({
    organizationId,
    operation: JOB_REQUIREMENT_PARSE_OPERATION,
    subjectKey,
    inputFingerprint: fingerprint,
    parseStored: (json) => normalizeFromStored(json, posting),
    isResultUsable: isUsableParsedRequirement,
    callProvider: async () =>
      callJobParseProvider(posting, seekerLearnedNotes, usage),
  });
  return data;
}

async function callJobParseProvider(
  posting: string,
  seekerLearnedNotes: string | null | undefined,
  usage?: AiCallUsageContext,
): Promise<ParsedJobRequirement> {
  const ai = getInterpretationAiProvider();
  let data: unknown;
  try {
    const response = await ai.generateStructured({
      ...structuredOutputRequest("jobRequirement"),
      ...(usage ? aiCallTracking(usage) : {}),
      messages: buildJobRequirementMessages(posting, seekerLearnedNotes),
    });
    data = response.data;
  } catch (error) {
    if (error instanceof TenantError) throw error;
    console.error(
      JSON.stringify({
        event: "job_requirement_parse_failed",
        message: error instanceof Error ? error.message : "unknown",
      }),
    );
    throw new TenantError(
      "The job posting could not be parsed. Nothing was saved.",
    );
  }

  const parsed = jobRequirementAiResultSchema.safeParse(data);
  if (!parsed.success) {
    console.error(
      JSON.stringify({
        event: "job_requirement_parse_invalid",
        issues: parsed.error.issues.map((issue) => issue.message),
      }),
    );
    throw new TenantError(
      "The job posting could not be parsed. Nothing was saved.",
    );
  }

  const model = parsed.data;
  return normalizeParsedJobRequirement(
    {
      ...model,
      scorecard: {
        mission: model.scorecard.missionText
          ? {
              text: model.scorecard.missionText,
              inferred: model.scorecard.missionInferred,
            }
          : null,
        outcomes: model.scorecard.outcomes,
        competencies: model.scorecard.competencies,
      },
    },
    posting,
  );
}
