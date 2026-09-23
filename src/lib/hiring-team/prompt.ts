import type { AiMessage } from "@/lib/ai/types";
import { HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION } from "@/lib/hiring-team/contract";
import { HIRING_TEAM_IDENTIFICATION_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/hiring-team-identification";

export function buildHiringTeamIdentificationMessages(input: {
  evidence: Array<{ sourceId: string; displayName: string; text: string }>;
}): AiMessage[] {
  const system = `Prompt version: ${HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION}

${HIRING_TEAM_IDENTIFICATION_SYSTEM_INSTRUCTIONS}`;
  const user = JSON.stringify({
    evidence: input.evidence.map((excerpt) => ({
      sourceId: excerpt.sourceId,
      displayName: excerpt.displayName,
      text: excerpt.text,
    })),
  });
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
