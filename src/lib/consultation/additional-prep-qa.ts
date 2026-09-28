import {
  contactIdFromCheatSheetTarget,
  type HarperInterviewerSection,
  type StandingInlineTopic,
} from "@/lib/consultation/harper-layout";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import { contactIdFromPersonPrepTarget } from "@/lib/interview/person-prep";

/** Exact heading for the Direct-role secondary Q&A mirror (Batch B5). */
export const ADDITIONAL_INTERVIEW_PREP_QA_HEADING =
  "Additional Interview Prep Q&A";

export type AdditionalPrepQaEntry = {
  questionTurnId: string;
  question: string;
  /** Answer text Harper currently shows for this item. */
  answer: string;
  targetKey: string | null;
  /**
   * Contact whose Harper profile owns the primary question card.
   * null = Where you stand / general (no person selected on Edit).
   */
  primaryContactId: string | null;
};

/** True when the item has a seeker-facing answer Harper would display. */
export function consultationItemIsAnswered(item: ConsultationQaItem): boolean {
  if (item.ignored) return false;
  if (item.talkingPoint?.content?.trim()) return true;
  if (item.resumeBullet?.content?.trim()) return true;
  return item.seekerAnswers.some((row) => row.body.trim().length > 0);
}

/**
 * Same answer content Harper shows on the primary card: polished talk track,
 * else resume bullet, else latest seeker reply.
 */
export function consultationItemDisplayAnswer(item: ConsultationQaItem): string {
  const talk = item.talkingPoint?.content?.trim() ?? "";
  if (talk) return talk;
  const bullet = item.resumeBullet?.content?.trim() ?? "";
  if (bullet) return bullet;
  for (let i = item.seekerAnswers.length - 1; i >= 0; i -= 1) {
    const body = item.seekerAnswers[i]?.body?.trim() ?? "";
    if (body) return body;
  }
  return "";
}

export function primaryContactIdForQaItem(
  item: ConsultationQaItem,
): string | null {
  return (
    contactIdFromPersonPrepTarget(item.targetKey) ??
    contactIdFromCheatSheetTarget(item.targetKey)
  );
}

/**
 * Walk Harper's display order: dedicated standing topics, then standing
 * requirements (UI order), then each interviewer section (layout order).
 * Returns answered items only, each once.
 */
export function orderedAnsweredHarperQuestions(input: {
  dedicatedTopics: StandingInlineTopic[];
  /** Same order as Where you stand requirement rows. */
  standingRequirementRows: Array<{
    targetKey: string;
    questions: ConsultationQaItem[];
  }>;
  interviewers: HarperInterviewerSection[];
}): ConsultationQaItem[] {
  const seen = new Set<string>();
  const ordered: ConsultationQaItem[] = [];

  function pushAll(questions: ConsultationQaItem[]) {
    for (const item of questions) {
      if (seen.has(item.questionTurnId)) continue;
      if (!consultationItemIsAnswered(item)) continue;
      seen.add(item.questionTurnId);
      ordered.push(item);
    }
  }

  for (const topic of input.dedicatedTopics) {
    pushAll(topic.questions);
  }
  for (const row of input.standingRequirementRows) {
    pushAll(row.questions);
  }
  for (const section of input.interviewers) {
    pushAll(section.questions);
  }
  return ordered;
}

/**
 * Secondary display for a Direct role profile: every answered Harper question
 * except those already shown as this profile's own primary content.
 * Indirect / unknown involvement → empty (no heading).
 */
export function additionalInterviewPrepQaForProfile(input: {
  involvement: "DIRECT" | "INDIRECT" | null | undefined;
  /** Question turn ids already rendered in this profile's primary slots. */
  profilePrimaryQuestionTurnIds: Iterable<string>;
  answeredInHarperOrder: ConsultationQaItem[];
}): AdditionalPrepQaEntry[] {
  if (input.involvement !== "DIRECT") return [];
  const exclude = new Set(
    [...input.profilePrimaryQuestionTurnIds]
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const entries: AdditionalPrepQaEntry[] = [];
  for (const item of input.answeredInHarperOrder) {
    if (exclude.has(item.questionTurnId)) continue;
    const answer = consultationItemDisplayAnswer(item);
    if (!answer) continue;
    entries.push({
      questionTurnId: item.questionTurnId,
      question: item.question,
      answer,
      targetKey: item.targetKey,
      primaryContactId: primaryContactIdForQaItem(item),
    });
  }
  return entries;
}

/** Primary turn ids owned by this contact's interviewer section (coach + person-prep). */
export function profilePrimaryQuestionTurnIdsFromInterviewerSection(
  section: HarperInterviewerSection | null | undefined,
): string[] {
  if (!section) return [];
  return section.questions.map((item) => item.questionTurnId);
}
