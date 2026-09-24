import type { EvidenceTarget } from "@/lib/consultation/assess";
import type { ConsultationExtractResult } from "@/lib/consultation/contract";
import { validModelQuestion } from "@/lib/consultation/questions";
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
  competencyLinks: Array<{ id: string; text: string; explanation: string }>;
};

export type ProposalDraft = {
  kind: "FACT" | "STORY";
  text: string;
  story: StoryDraft | null;
  profileItemId: string;
};

export function proposalsFromExtraction(input: {
  answer: string;
  turnId: string;
  extracted: ConsultationExtractResult;
  targets: EvidenceTarget[];
}): {
  proposals: ProposalDraft[];
  dropped: string[];
  followUpQuestion: string | null;
  missingStarElements: ConsultationExtractResult["missingStarElements"];
} {
  const dropped: string[] = [];
  const proposals: ProposalDraft[] = [];
  input.extracted.facts.forEach((fact, index) => {
    if (!groundedInAnswer(fact.text, input.answer)) {
      dropped.push(`fact:${index}`);
      return;
    }
    if (!isCompleteFactStatement(fact.text)) {
      dropped.push(`fact:${index}:fragment`);
      return;
    }
    proposals.push({
      kind: "FACT",
      text: fact.text.trim(),
      story: null,
      profileItemId: `consult_${input.turnId}_fact_${index}`,
    });
  });
  const targetByKey = new Map(input.targets.map((target) => [target.key, target]));
  const links = input.extracted.demonstratedTargets.flatMap((link) => {
    const target = targetByKey.get(link.targetKey);
    if (!target) {
      dropped.push(`target:${link.targetKey}`);
      return [];
    }
    return [{
      id: target.key,
      text: target.text,
      explanation: link.explanation.trim(),
    }];
  });
  const story = input.extracted.story;
  const completeStory =
    story?.situation &&
    story.task &&
    story.action &&
    story.result &&
    groundedInAnswer(story.situation, input.answer) &&
    groundedInAnswer(story.task, input.answer) &&
    groundedInAnswer(story.action, input.answer) &&
    groundedInAnswer(story.result, input.answer);
  if (story && !completeStory) {
    dropped.push("story:unsupported-or-incomplete");
  }
  if (completeStory && story?.situation && story.task && story.action && story.result) {
    proposals.push({
      kind: "STORY",
      text: story.result,
      story: {
        situation: story.situation,
        task: story.task,
        action: story.action,
        result: story.result,
        competencyLinks: links,
      },
      profileItemId: `consult_${input.turnId}_story`,
    });
  }
  const followUpQuestion =
    input.extracted.missingStarElements.length > 0 &&
    input.extracted.followUpQuestion &&
    validModelQuestion(input.extracted.followUpQuestion)
      ? input.extracted.followUpQuestion.trim()
      : null;
  return {
    proposals,
    dropped,
    followUpQuestion,
    missingStarElements: input.extracted.missingStarElements,
  };
}

export function isCompleteFactStatement(text: string): boolean {
  const value = text.trim();
  if (value.length < 24) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  const hasVerb =
    /\b(is|are|was|were|has|have|had|used|led|built|cut|wrote|shipped|managed|created|designed|ran|owns|works?|increased|reduced|delivered|rewrote|owned)\b/i.test(
      value,
    );
  const startsWithFragment = /^(and|or|but|with|for|to|of|in|on|at|the|a|an)\b/i.test(
    value,
  );
  return hasVerb && !startsWithFragment;
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
