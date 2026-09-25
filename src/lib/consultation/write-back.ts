import type { EvidenceTarget } from "@/lib/consultation/assess";
import {
  WHY_THIS_COMPANY_TARGET_KEY,
  type ConsultationExtractResult,
} from "@/lib/consultation/contract";
import { validModelQuestion } from "@/lib/consultation/questions";
import {
  factsSupportedBySources,
  knownNamesFromProfile,
} from "@/lib/grounding/fact-tokens";
import { consultationConversationCopy } from "@/lib/product-config";
import {
  parseCandidateProfile,
  type CandidateProfile,
  type ProfileFactItem,
} from "@/lib/product-research/candidate-profile";
import { profileEvidenceItems } from "@/lib/consultation/assess";

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

export type DroppedExtraction = {
  key: string;
  text: string;
  reason: string;
};

export function proposalsFromExtraction(input: {
  answer: string;
  turnId: string;
  extracted: ConsultationExtractResult;
  targets: EvidenceTarget[];
  profile?: CandidateProfile | null;
}): {
  proposals: ProposalDraft[];
  dropped: string[];
  droppedDetails: DroppedExtraction[];
  followUpQuestion: string | null;
  missingStarElements: ConsultationExtractResult["missingStarElements"];
  partialStory: StoryDraft | null;
} {
  const dropped: string[] = [];
  const droppedDetails: DroppedExtraction[] = [];
  const proposals: ProposalDraft[] = [];
  const drop = (item: DroppedExtraction) => {
    dropped.push(item.key);
    droppedDetails.push(item);
    console.info(
      JSON.stringify({
        event: "consultation_grounding_dropped",
        text: item.text,
        reason: item.reason,
      }),
    );
  };
  input.extracted.facts.forEach((fact, index) => {
    if (!isCompleteFactStatement(fact.text)) {
      drop({
        key: `fact:${index}:fragment`,
        text: fact.text,
        reason: "The extracted fact was a fragment, not a complete statement.",
      });
      return;
    }
    const grounding = meaningGroundedInAnswer(fact.text, input.answer, input.profile);
    if (!grounding.ok) {
      drop({
        key: `fact:${index}`,
        text: fact.text,
        reason: grounding.reason ?? "The fact is not supported by the answer or Personal Profile.",
      });
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
      drop({
        key: `target:${link.targetKey}`,
        text: link.explanation,
        reason: "That requirement is not on this job.",
      });
      return [];
    }
    if (target.key === WHY_THIS_COMPANY_TARGET_KEY) {
      drop({
        key: `target:${link.targetKey}:motivation`,
        text: link.explanation,
        reason: "Why-this-company is stored as motivation, not a work story.",
      });
      return [];
    }
    if (!link.explanation.trim()) {
      drop({
        key: `target:${link.targetKey}:no-explanation`,
        text: "",
        reason: "The competency link had no explanation.",
      });
      return [];
    }
    return [{
      id: target.key,
      text: target.text,
      explanation: link.explanation.trim(),
    }];
  });
  const story = input.extracted.story;
  const missingStarElements: ConsultationExtractResult["missingStarElements"] = [
    ...input.extracted.missingStarElements,
  ];
  const addMissing = (
    part: ConsultationExtractResult["missingStarElements"][number],
  ) => {
    if (!missingStarElements.includes(part)) missingStarElements.push(part);
  };
  let partialStory: StoryDraft | null = null;
  if (story) {
    const parts: Array<{
      key: ConsultationExtractResult["missingStarElements"][number];
      value: string | null;
    }> = [
      { key: "SITUATION", value: story.situation },
      { key: "TASK", value: story.task },
      { key: "ACTION", value: story.action },
      { key: "RESULT", value: story.result },
    ];
    const kept: Partial<Record<(typeof parts)[number]["key"], string>> = {};
    for (const part of parts) {
      if (!part.value?.trim()) {
        addMissing(part.key);
        continue;
      }
      const grounding = meaningGroundedInAnswer(
        part.value,
        input.answer,
        input.profile,
      );
      if (!grounding.ok) {
        drop({
          key: `story:${part.key.toLowerCase()}`,
          text: part.value,
          reason:
            grounding.reason ??
            "This part of the story is not supported by the answer or Personal Profile.",
        });
        addMissing(part.key);
        continue;
      }
      kept[part.key] = part.value;
      const keptIndex = missingStarElements.indexOf(part.key);
      if (keptIndex >= 0) missingStarElements.splice(keptIndex, 1);
    }
    if (kept.SITUATION || kept.TASK || kept.ACTION || kept.RESULT) {
      partialStory = {
        situation: kept.SITUATION ?? "",
        task: kept.TASK ?? "",
        action: kept.ACTION ?? "",
        result: kept.RESULT ?? "",
        competencyLinks: links,
      };
    }
    if (kept.SITUATION && kept.TASK && kept.ACTION && kept.RESULT) {
      proposals.push({
        kind: "STORY",
        text: kept.RESULT,
        story: {
          situation: kept.SITUATION,
          task: kept.TASK,
          action: kept.ACTION,
          result: kept.RESULT,
          competencyLinks: links,
        },
        profileItemId: `consult_${input.turnId}_story`,
      });
    }
  }
  const followUpQuestion =
    missingStarElements.length > 0
      ? input.extracted.followUpQuestion &&
        validModelQuestion(input.extracted.followUpQuestion)
        ? input.extracted.followUpQuestion.trim()
        : followUpForMissingStar(missingStarElements)
      : null;
  return {
    proposals,
    dropped,
    droppedDetails,
    followUpQuestion,
    missingStarElements,
    partialStory,
  };
}

export function followUpForMissingStar(
  missing: ConsultationExtractResult["missingStarElements"],
): string {
  const first = missing[0];
  if (first && first in consultationConversationCopy.missingStarAsk) {
    return consultationConversationCopy.missingStarAsk[first];
  }
  return consultationConversationCopy.askForStory;
}

export function isCompleteFactStatement(text: string): boolean {
  const value = text.trim();
  if (value.length < 24) return false;
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 6) return false;
  const hasVerb =
    /\b(is|are|was|were|be|been|am|has|have|had|used|led|built|cut|wrote|shipped|managed|created|designed|ran|owns|works?|increased|reduced|delivered|rewrote|owned|grew|hired|coached|closed|sold|won|took|kept)\b/i.test(
      value,
    ) ||
    /\b(?:I|we|they|she|he|the team)\s+[A-Za-z]+ed\b/i.test(value) ||
    /\b[A-Za-z]{3,}ed\b/.test(value);
  const startsWithFragment = /^(and|or|but|with|for|to|of|in|on|at)\b/i.test(
    value,
  );
  return hasVerb && !startsWithFragment;
}

export function meaningGroundedInAnswer(
  proposalText: string,
  answer: string,
  profile?: CandidateProfile | null,
): { ok: boolean; reason: string | null } {
  const text = proposalText.trim();
  if (text.length < 8) {
    return { ok: false, reason: "The extracted text was too short to verify." };
  }
  const sources = [answer];
  if (profile) {
    sources.push(
      ...profileEvidenceItems(profile)
        .filter((item) => item.kind === "FACT")
        .map((item) => item.text),
    );
  }
  const known = profile
    ? knownNamesFromProfile(profile)
    : { employers: [], titles: [] };
  const result = factsSupportedBySources(text, sources, known);
  return { ok: result.ok, reason: result.reason };
}

export function groundedInAnswer(
  proposalText: string,
  answer: string,
  profile?: CandidateProfile | null,
): boolean {
  return meaningGroundedInAnswer(proposalText, answer, profile).ok;
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
