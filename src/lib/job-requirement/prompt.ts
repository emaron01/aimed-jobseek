import type { AiMessage } from "@/lib/ai/types";
import { JOB_REQUIREMENT_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { JOB_REQUIREMENT_PROMPT_VERSION } from "@/lib/job-requirement/types";

export function buildJobRequirementMessages(
  rawText: string,
  seekerLearnedNotes?: string | null,
): AiMessage[] {
  const notes = seekerLearnedNotes?.trim() || "";
  const system = `Prompt version: ${JOB_REQUIREMENT_PROMPT_VERSION}

${JOB_REQUIREMENT_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify(
    {
      instruction: notes
        ? "Parse this job posting together with the seeker's notes about what they have learned. Use the notes to correct or add requirements the posting missed. Leave remaining missing fields empty. Do not fetch or assume anything beyond the posting and notes."
        : "Parse this job posting. Leave missing fields empty. Do not fetch or assume anything beyond the text.",
      postingText: rawText,
      seekerLearnedNotes: notes || null,
      responseSchema: {
        title: "string|null",
        companyName: "string|null",
        location: "string|null",
        workArrangement: "string|null",
        employmentType: "string|null",
        seniority: "string|null",
        compensationRange: "string|null",
        reportingLine: "string|null",
        responsibilities: ["string"],
        requiredItems: ["string"],
        preferredItems: ["string"],
        scorecard: {
          missionText: "string|null",
          missionInferred: "boolean — true when the mission was derived rather than stated",
          outcomes: [{ text: "string", inferred: "boolean" }],
          competencies: [{ text: "string", inferred: "boolean" }],
        },
      },
    },
    null,
    2,
  );
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
