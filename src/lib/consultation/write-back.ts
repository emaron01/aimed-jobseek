import type { EvidenceAssessment, EvidenceTarget } from "@/lib/consultation/assess";
import {
  assessEvidence,
  contentTokens,
  profileFactEvidence,
} from "@/lib/consultation/assess";
import { answerHasResult } from "@/lib/consultation/questions";
import {
  parseCandidateProfile,
  type CandidateProfile,
  type ProfileFactItem,
} from "@/lib/product-research/candidate-profile";

export type StoryDraft = {
  situation: string;
  task: string;
  action: string;
  result: string;
  competencyLinks: Array<{ id: string; text: string }>;
};

export type ProposalDraft = {
  kind: "FACT" | "STORY";
  text: string;
  story: StoryDraft | null;
  profileItemId: string;
};

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resultSentence(answer: string): string | null {
  const parts = sentences(answer);
  const hit = parts.find((part) => answerHasResult(part));
  return hit ?? (answerHasResult(answer) ? answer.trim() : null);
}

export function proposalsFromAnswer(input: {
  answer: string;
  turnId: string;
  competencies: Array<{ id: string; text: string }>;
  targetCompetency?: { id: string; text: string } | null;
  allowWithoutResult: boolean;
}): ProposalDraft[] {
  const answer = input.answer.trim();
  if (!answer) return [];
  const result = resultSentence(answer);
  if (!result && !input.allowWithoutResult) return [];
  const proposals: ProposalDraft[] = [];
  const factText = result ?? answer;
  proposals.push({
    kind: "FACT",
    text: factText,
    story: null,
    profileItemId: `consult_${input.turnId}_fact`,
  });
  if (!result) return proposals;
  const parts = sentences(answer);
  const before = parts.filter((part) => part !== result);
  const situation = before[0] ?? answer;
  const action = before.slice(1).join(" ") || situation;
  const answerTokens = new Set(contentTokens(answer));
  const competencies = input.targetCompetency
    ? [
        input.targetCompetency,
        ...input.competencies.filter((item) => item.id !== input.targetCompetency?.id),
      ]
    : input.competencies;
  const links = competencies.filter((item) => {
    const shared = contentTokens(item.text).filter((token) =>
      answerTokens.has(token),
    );
    return shared.length > 0;
  });
  proposals.push({
    kind: "STORY",
    text: result,
    story: {
      situation,
      task: situation,
      action,
      result,
      competencyLinks: links,
    },
    profileItemId: `consult_${input.turnId}_story`,
  });
  return proposals;
}

export function groundedInAnswer(proposalText: string, answer: string): boolean {
  const needle = proposalText.trim().toLowerCase();
  if (needle.length < 8) return false;
  return answer.toLowerCase().includes(needle);
}

/** Most recent FACT role: a current role, otherwise the latest start date. */
export function latestFactExperience(profile: CandidateProfile) {
  const roles = profile.experience.filter((role) => role.kind === "FACT");
  const current = roles.find((role) => !role.endDate);
  if (current) return current;
  return (
    [...roles].sort((a, b) =>
      (b.startDate ?? "").localeCompare(a.startDate ?? ""),
    )[0] ?? null
  );
}

function factItem(id: string, text: string, turnId: string): ProfileFactItem {
  return {
    id,
    kind: "FACT",
    text,
    provenance: [{ sourceId: turnId }],
  };
}

/** Appends a confirmed fact. Does not write unless the caller has already confirmed. */
export function appendConfirmedFact(
  profile: CandidateProfile,
  input: { id: string; text: string; turnId: string },
): CandidateProfile {
  const text = input.text.trim();
  if (!text) {
    throw new Error("A confirmed fact needs text.");
  }
  const next = parseCandidateProfile(profile);
  if (
    next.skills.some((item) => item.id === input.id) ||
    next.experience.some((role) =>
      role.achievements.some((item) => item.id === input.id),
    )
  ) {
    return next;
  }
  const item = factItem(input.id, text, input.turnId);
  const latest = latestFactExperience(next);
  if (latest) {
    latest.achievements.push(item);
  } else {
    next.skills.push(item);
  }
  return parseCandidateProfile(next);
}

export function reassessProfile(input: {
  profile: CandidateProfile;
  targets: EvidenceTarget[];
}): EvidenceAssessment[] {
  return assessEvidence({
    targets: input.targets,
    facts: profileFactEvidence(input.profile),
  });
}
