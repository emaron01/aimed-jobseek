import type { EvidenceAssessment } from "@/lib/consultation/assess";
import { openGaps } from "@/lib/consultation/assess";
import { consultationConfig } from "@/lib/product-config/consultation";

export type PlannedQuestion = {
  targetKey: string;
  followUp: boolean;
  text: string;
};

const SENIOR_ROLE =
  /\b(senior|staff|principal|director|lead|manager|head|vp|vice|executive|chief)\b/i;

export function seniorityWarrantsChronology(input: {
  seniority: string | null;
  title: string | null;
}): boolean {
  return SENIOR_ROLE.test(`${input.seniority ?? ""} ${input.title ?? ""}`);
}

export function answerHasResult(answer: string): boolean {
  const text = answer.trim();
  if (!text) return false;
  if (/\d/.test(text)) return true;
  if (/%/.test(text)) return true;
  return /\b(reduced|increased|cut|grew|saved|improved)\b/i.test(text);
}

export function resultFollowUpQuestion(requirement: string): string {
  return `What was the concrete result for "${requirement}", including a number or a before-and-after if you have one?`;
}

export function planQuestionRound(input: {
  assessments: EvidenceAssessment[];
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  includeChronology: boolean;
  chronologyAsked: boolean;
  recentRole: { title: string | null; employer: string | null } | null;
  hiringTeamNote: string | null;
}): PlannedQuestion[] {
  const gaps = openGaps(input.assessments).filter(
    (gap) => !input.askedKeys.has(gap.key) && !input.skippedKeys.has(gap.key),
  );
  const room = input.includeChronology && !input.chronologyAsked
    ? consultationConfig.roundSize - 1
    : consultationConfig.roundSize;
  const selected = gaps.slice(0, Math.max(room, 0));
  const note = input.hiringTeamNote?.trim()
    ? ` ${input.hiringTeamNote.trim()}`
    : "";
  const questions: PlannedQuestion[] = selected.map((gap) => ({
    targetKey: gap.key,
    followUp: false,
    text: `Tell a story about "${gap.text}". Cover the situation, what you were responsible for, what you did, and the result.${note}`,
  }));
  if (input.includeChronology && !input.chronologyAsked) {
    const role = input.recentRole;
    const where = [role?.title, role?.employer].filter(Boolean).join(" at ");
    questions.push({
      targetKey: "chronology",
      followUp: false,
      text: where
        ? `Walk through what you accomplished as ${where}, and why you moved on.`
        : "Walk through what you accomplished in your most recent role, and why you moved on.",
    });
  }
  return questions.slice(0, consultationConfig.roundSize);
}
