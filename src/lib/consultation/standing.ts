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
import {
  harperCoachingVoiceViolations,
  seekerPrepInstructionViolations,
} from "@/lib/consultation/voice";

export const CONSULTATION_GAP_STATUSES = ["open", "closed", "confirmed"] as const;
export type ConsultationGapStatus = (typeof CONSULTATION_GAP_STATUSES)[number];

export type StandingGap = {
  targetKey: string;
  label: string;
  status: ConsultationGapStatus;
  talkTrack: string | null;
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
  if (item?.followUp && !talkTrack) {
    return { status: "open", talkTrack: null };
  }
  if (decision === "no_evidence" && talkTrack) {
    return { status: "confirmed", talkTrack };
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

export function buildStandingGaps(input: {
  assessments: Array<
    Pick<EvidenceAssessment, "key" | "kind" | "text" | "strength">
  >;
  questions: ConsultationQaItem[];
}): StandingGap[] {
  const byKey = new Map(
    input.questions
      .filter((item) => item.targetKey)
      .map((item) => [item.targetKey as string, item]),
  );
  return input.assessments
    .filter((assessment) => isStandingRequirement(assessment))
    .filter(
      (assessment) =>
        assessment.strength !== "STRONG" || byKey.has(assessment.key),
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
      const item = byKey.get(assessment.key);
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
  if (input.promptVersion !== input.currentPromptVersion) return true;
  return input.texts.some(
    (text) =>
      harperCoachingVoiceViolations({
        text,
        firstName: input.firstName,
      }).length > 0 || seekerPrepInstructionViolations(text).length > 0,
  );
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
