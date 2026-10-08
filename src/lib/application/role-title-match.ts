import { resolveContactPersonaDecision } from "@/lib/campaign/contact-persona";
import { parseStringArray } from "@/lib/research/freshness";
import { evaluatePersonaTitleGate } from "@/lib/scoring/title-fit";

/** Form value for "Create a new role from this title". Not a persona id. */
export const CREATE_ROLE_FROM_TITLE = "__create_role__";

export type ApplicationHiringTeamRole = {
  id: string;
  name: string;
  suggestionKey: string | null;
  targetTitles: unknown;
};

function titleGates(input: {
  title: string | null;
  roles: ApplicationHiringTeamRole[];
}) {
  return input.roles.map((role) =>
    evaluatePersonaTitleGate({
      persona: {
        id: role.id,
        name: role.name,
        targetTitles: parseStringArray(role.targetTitles),
        criteria: [],
      },
      contactTitle: input.title,
      applyPositiveFit: true,
    }),
  );
}

/** Roles whose likely titles match what the seeker typed. */
export function matchingHiringTeamRoles(input: {
  title: string | null;
  roles: ApplicationHiringTeamRole[];
}): ApplicationHiringTeamRole[] {
  const matched = new Set(
    titleGates(input)
      .filter((gate) => gate.status === "CANDIDATE")
      .map((gate) => gate.personaId),
  );
  return input.roles.filter((role) => matched.has(role.id));
}

export function matchHiringTeamRoleFromTitle(input: {
  title: string | null;
  roles: ApplicationHiringTeamRole[];
}): ReturnType<typeof resolveContactPersonaDecision> {
  const candidates = titleGates(input).filter((gate) => gate.status === "CANDIDATE");
  const recruiter = input.roles.find((role) => role.suggestionKey === "recruiter");
  if (candidates.length === 1) {
    return resolveContactPersonaDecision({
      matchedPersonaId: candidates[0]!.personaId,
    });
  }
  if (candidates.length > 1) {
    const recruiterCandidate = candidates.find(
      (gate) => gate.personaId === recruiter?.id,
    );
    return resolveContactPersonaDecision({
      aiSkipReason: "MULTI_PERSONA_MATCH",
      suggestedPersonaId:
        recruiterCandidate?.personaId ?? candidates[0]!.personaId,
    });
  }
  return resolveContactPersonaDecision({
    aiSkipReason: "NO_TITLE_FIT",
    suggestedPersonaId: recruiter?.id ?? input.roles[0]?.id ?? null,
  });
}
