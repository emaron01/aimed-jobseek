import {
  isStandingRequirement,
  type EvidenceAssessment,
  type EvidenceKind,
} from "@/lib/consultation/assess";

const KIND_RANK: Record<EvidenceKind, number> = {
  REQUIRED: 0,
  OUTCOME: 1,
  COMPETENCY: 2,
  MISSION: 3,
  PREFERRED: 4,
};
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";

export const CONSULTATION_GAP_STATUSES = ["open", "closed", "confirmed"] as const;
export type ConsultationGapStatus = (typeof CONSULTATION_GAP_STATUSES)[number];

export type StandingGap = {
  targetKey: string;
  label: string;
  status: ConsultationGapStatus;
  talkTrack: string | null;
  harperNote?: string | null;
};

export function gapDecisionFromAnalysis(value: unknown):
  | "evidence"
  | "no_evidence"
  | "incomplete"
  | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const decision = (value as { gapDecision?: unknown }).gapDecision;
  if (
    decision === "evidence" ||
    decision === "no_evidence" ||
    decision === "incomplete"
  ) {
    return decision;
  }
  return null;
}

export function standingGapStatus(item: ConsultationQaItem | undefined): {
  status: ConsultationGapStatus;
  talkTrack: string | null;
} {
  const talkTrack = item?.talkingPoint?.content.trim() || null;
  const decision = gapDecisionFromAnalysis(
    item?.seekerAnswers.at(-1)?.analysisJson,
  );
  if (decision === "incomplete") {
    return { status: "open", talkTrack: null };
  }
  if (decision === "no_evidence") {
    return { status: "confirmed", talkTrack };
  }
  if (item?.followUp && !talkTrack) {
    return { status: "open", talkTrack: null };
  }
  if (decision === "evidence" && talkTrack) {
    return { status: "closed", talkTrack };
  }
  if (talkTrack && item?.resumeBullet) {
    return { status: "closed", talkTrack };
  }
  if (talkTrack && !item?.resumeBullet) {
    return { status: "confirmed", talkTrack };
  }
  return { status: "open", talkTrack: null };
}

/**
 * One QA item per target key for gap status. Prefer Harper's decided work
 * (evidence / no_evidence, or a drafted result) over a later unanswered ask.
 */
export function qaItemForTargetKey(
  questions: ConsultationQaItem[],
  targetKey: string | null | undefined,
): ConsultationQaItem | undefined {
  if (!targetKey) return undefined;
  const matches = questions.filter((item) => item.targetKey === targetKey);
  if (matches.length <= 1) return matches[0];
  const rank = (item: ConsultationQaItem): number => {
    const decision = gapDecisionFromAnalysis(
      item.seekerAnswers.at(-1)?.analysisJson,
    );
    if (decision === "evidence" || decision === "no_evidence") return 3;
    if (item.talkingPoint || item.resumeBullet) return 2;
    if (item.seekerAnswers.length > 0) return 1;
    return 0;
  };
  return matches.reduce((best, item) =>
    rank(item) >= rank(best) ? item : best,
  );
}

export function buildStandingGaps(input: {
  assessments: Array<
    Pick<EvidenceAssessment, "key" | "kind" | "text" | "strength">
  >;
  questions: ConsultationQaItem[];
}): StandingGap[] {
  return input.assessments
    .filter((assessment) => isStandingRequirement(assessment))
    .filter(
      (assessment) =>
        assessment.strength !== "STRONG" ||
        Boolean(qaItemForTargetKey(input.questions, assessment.key)),
    )
    .sort((left, right) => {
      const byKind = KIND_RANK[left.kind] - KIND_RANK[right.kind];
      if (byKind !== 0) return byKind;
      if (left.strength !== right.strength) {
        return left.strength === "NONE" ? -1 : 1;
      }
      return left.key.localeCompare(right.key);
    })
    .map((assessment) => {
      const item = qaItemForTargetKey(input.questions, assessment.key);
      const { status, talkTrack } = standingGapStatus(item);
      return {
        targetKey: assessment.key,
        label: assessment.text,
        status,
        talkTrack,
      };
    });
}

export function briefingNeedsStandingRegen(input: {
  texts: string[];
  firstName: string | null;
  promptVersion: string | null | undefined;
  currentPromptVersion: string;
}): boolean {
  return input.promptVersion !== input.currentPromptVersion;
}

export function standingWorkIsComplete(input: {
  gaps: Array<{ status: ConsultationGapStatus }>;
  unansweredQuestions: boolean;
}): boolean {
  if (input.unansweredQuestions) return false;
  return input.gaps.every(
    (gap) => gap.status === "closed" || gap.status === "confirmed",
  );
}

export function shouldEnqueueConsultationStandingRegen(input: {
  needsRegen: boolean;
  busy: boolean;
  lastReassessAttemptAt: Date | null;
  lastReassessSucceeded?: boolean;
  stalePromptVersion?: boolean;
}): boolean {
  if (!input.needsRegen || input.busy) return false;
  if (!input.lastReassessAttemptAt) return true;
  if (input.stalePromptVersion && input.lastReassessSucceeded) return true;
  return false;
}
