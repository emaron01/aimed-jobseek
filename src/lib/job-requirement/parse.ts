import { isInterpretationAiConfigured } from "@/lib/ai/config";
import { getInterpretationAiProvider } from "@/lib/ai/provider";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { buildJobRequirementMessages } from "@/lib/job-requirement/prompt";
import { jobRequirementAiResultSchema } from "@/lib/job-requirement/schema";
import type { ParsedJobRequirement } from "@/lib/job-requirement/types";
import { vocab } from "@/lib/product-config";
import { TenantError } from "@/lib/tenant/errors";

export async function interpretJobPosting(
  rawText: string,
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

  const ai = getInterpretationAiProvider();
  let data: unknown;
  try {
    const response = await ai.generateStructured({
      ...structuredOutputRequest("jobRequirement"),
      messages: buildJobRequirementMessages(posting),
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
