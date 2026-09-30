/**
 * Single Where you stand list: one entry per requirement/topic, with near-duplicates
 * merged under Required wording.
 */
import {
  sameRequirementMeaning,
  type EvidenceKind,
} from "@/lib/consultation/assess";
import type { StandingInlineTopic } from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

export type StandingStrength = "STRONG" | "PARTIAL" | "NONE";

export type StandingEvidenceFact = {
  id: string;
  label: string;
  detail: string | null;
};

export type StandingListEntry = {
  /** Stable React key. */
  id: string;
  /** Canonical target key for forms / ignore (prefer Required when merged). */
  targetKey: string;
  /** All assessment keys merged into this entry (for content union). */
  mergedTargetKeys: string[];
  label: string;
  strength: StandingStrength;
  kind: EvidenceKind | "TOPIC";
  explanation: string | null;
  experience: string | null;
  facts: StandingEvidenceFact[];
  questions: ConsultationQaItem[];
  /** Open gap with no inline question — show Save Answer share form. */
  showShareForm: boolean;
};

const STRENGTH_RANK: Record<StandingStrength, number> = {
  STRONG: 2,
  PARTIAL: 1,
  NONE: 0,
};

const KIND_RANK: Record<EvidenceKind | "TOPIC", number> = {
  REQUIRED: 0,
  OUTCOME: 1,
  COMPETENCY: 2,
  MISSION: 3,
  PREFERRED: 4,
  TOPIC: 5,
};

export function strongerStandingStrength(
  left: StandingStrength,
  right: StandingStrength,
): StandingStrength {
  return STRENGTH_RANK[left] >= STRENGTH_RANK[right] ? left : right;
}

export type StandingRequirementRow = {
  id: string;
  targetKey: string;
  text: string;
  strength: StandingStrength | null;
  kind?: EvidenceKind | null;
  explanation: string | null;
  experience: string | null;
  facts: StandingEvidenceFact[];
};

/**
 * Build one Where you stand list.
 * Near-duplicate Required + competency/outcome (sameRequirementMeaning) collapse
 * into one entry using the Required wording. Rating = the stronger of the two
 * strengths so positive evidence is not dropped; all questions from both keys
 * are merged.
 */
export function buildStandingListEntries(input: {
  requirements: StandingRequirementRow[];
  dedicatedTopics: StandingInlineTopic[];
  questionsByTargetKey: Map<string, ConsultationQaItem[]>;
}): StandingListEntry[] {
  const usedRequirementIds = new Set<string>();
  const entries: StandingListEntry[] = [];

  const requirements = [...input.requirements].sort((left, right) => {
    const leftKind = left.kind ?? "COMPETENCY";
    const rightKind = right.kind ?? "COMPETENCY";
    const byKind = KIND_RANK[leftKind] - KIND_RANK[rightKind];
    if (byKind !== 0) return byKind;
    return left.targetKey.localeCompare(right.targetKey);
  });

  for (const row of requirements) {
    if (usedRequirementIds.has(row.id)) continue;
    usedRequirementIds.add(row.id);

    const peers = requirements.filter(
      (other) =>
        other.id !== row.id &&
        !usedRequirementIds.has(other.id) &&
        sameRequirementMeaning(row.text, other.text),
    );
    for (const peer of peers) usedRequirementIds.add(peer.id);

    const group = [row, ...peers];
    const required = group.find((item) => item.kind === "REQUIRED") ?? row;
    const others = group.filter((item) => item.id !== required.id);

    let strength: StandingStrength = (required.strength ?? "NONE") as StandingStrength;
    const mergedKeys = new Set<string>([required.targetKey]);
    const questions: ConsultationQaItem[] = [
      ...(input.questionsByTargetKey.get(required.targetKey) ?? []),
    ];
    const facts = [...required.facts];
    let explanation = required.explanation;
    let experience = required.experience;

    for (const peer of others) {
      mergedKeys.add(peer.targetKey);
      strength = strongerStandingStrength(
        strength,
        (peer.strength ?? "NONE") as StandingStrength,
      );
      for (const question of input.questionsByTargetKey.get(peer.targetKey) ?? []) {
        if (!questions.some((q) => q.questionTurnId === question.questionTurnId)) {
          questions.push(question);
        }
      }
      for (const fact of peer.facts) {
        if (!facts.some((existing) => existing.id === fact.id)) {
          facts.push(fact);
        }
      }
      if (!explanation && peer.explanation) explanation = peer.explanation;
      if (!experience && peer.experience) experience = peer.experience;
    }

    const openQuestion = questions.some(
      (item) =>
        !item.ignored &&
        (Boolean(item.followUp) || (!item.resumeBullet && !item.talkingPoint)),
    );
    entries.push({
      id: required.id,
      targetKey: required.targetKey,
      mergedTargetKeys: [...mergedKeys],
      label: required.text,
      strength,
      kind: required.kind ?? "COMPETENCY",
      explanation,
      experience,
      facts,
      questions,
      showShareForm: !openQuestion && questions.length === 0 && strength !== "STRONG",
    });
  }

  for (const topic of input.dedicatedTopics) {
    const questions = topic.questions;
    const strengthFromQuestions = strengthHintFromQuestions(questions);
    entries.push({
      id: `topic:${topic.targetKey}`,
      targetKey: topic.targetKey,
      mergedTargetKeys: [topic.targetKey],
      label: topic.label,
      strength: strengthFromQuestions,
      kind: "TOPIC",
      explanation: null,
      experience: null,
      facts: [],
      questions,
      showShareForm: false,
    });
  }

  return entries.sort((left, right) => {
    const byKind = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (byKind !== 0) return byKind;
    return left.label.localeCompare(right.label);
  });
}

function strengthHintFromQuestions(
  questions: ConsultationQaItem[],
): StandingStrength {
  if (questions.some((item) => item.resumeBullet || item.talkingPoint)) {
    return "PARTIAL";
  }
  if (questions.some((item) => item.seekerAnswers.length > 0)) {
    return "PARTIAL";
  }
  return "NONE";
}
