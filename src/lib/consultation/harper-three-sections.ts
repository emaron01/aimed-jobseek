/**
 * Harper default view: partition questions into three sections.
 * Section 1 — Where you stand (requirements + approved gap/why/career answers)
 * Section 2 — Questions that need more information (until APPROVED)
 * Section 3 — Best-practice interview questions (role-expertise, always)
 */
import {
  ASK_HARPER_TARGET_PREFIX,
  CHRONOLOGY_TARGET_KEY,
  ROLE_EXPERTISE_TARGET_PREFIX,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import type { StandingListEntry } from "@/lib/consultation/standing-entries";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

export type HarperPageSectionId =
  | "where-you-stand"
  | "needs-more-info"
  | "best-practice";

export const HARPER_SECTION_IDS = {
  standing: "where-you-stand" as const,
  needsInfo: "needs-more-info" as const,
  bestPractice: "best-practice" as const,
};

export function questionHasApprovedResult(item: ConsultationQaItem): boolean {
  return (
    item.talkingPoint?.status === "APPROVED" ||
    item.resumeBullet?.status === "APPROVED"
  );
}

export function isRoleExpertiseQuestion(item: ConsultationQaItem): boolean {
  return Boolean(item.targetKey?.startsWith(ROLE_EXPERTISE_TARGET_PREFIX));
}

export function isApprovedAskHarperQuestion(item: ConsultationQaItem): boolean {
  return Boolean(
    item.targetKey?.startsWith(ASK_HARPER_TARGET_PREFIX) &&
      !item.ignored &&
      (item.talkingPoint?.status === "APPROVED" ||
        item.resumeBullet?.status === "APPROVED"),
  );
}

export function isWhyThisCompanyQuestion(item: ConsultationQaItem): boolean {
  return item.targetKey === WHY_THIS_COMPANY_TARGET_KEY;
}

export function isCareerWalkThroughQuestion(item: ConsultationQaItem): boolean {
  return item.targetKey === CHRONOLOGY_TARGET_KEY;
}

export function isDedicatedPrepQuestion(item: ConsultationQaItem): boolean {
  return isWhyThisCompanyQuestion(item) || isCareerWalkThroughQuestion(item);
}

/**
 * A seeker answer typed into the Where you stand share box.
 * That reply has no consultant question, so the card is titled "Your answer"
 * and its id is the seeker turn. Harper-asked questions keep their own id.
 */
export function isStandingShareAnswer(item: ConsultationQaItem): boolean {
  if (item.ignored) return false;
  if (isRoleExpertiseQuestion(item)) return false;
  if (item.targetKey?.startsWith(ASK_HARPER_TARGET_PREFIX)) return false;
  if (item.question.trim() !== consultationConversationCopy.yourAnswer) return false;
  return item.seekerAnswers.some((answer) => answer.id === item.questionTurnId);
}

/**
 * Section assignment for a question (exactly one section).
 * Role-expertise → always Section 3.
 * Answers typed in Where you stand stay in Section 1, draft or approved.
 * Harper-asked why / career / requirement gaps → Section 2 until APPROVED, then Section 1.
 */
export function harperSectionForQuestion(
  item: ConsultationQaItem,
): HarperPageSectionId {
  if (isRoleExpertiseQuestion(item) || isApprovedAskHarperQuestion(item)) {
    return HARPER_SECTION_IDS.bestPractice;
  }
  if (isStandingShareAnswer(item)) {
    return HARPER_SECTION_IDS.standing;
  }
  if (questionHasApprovedResult(item) && !item.ignored) {
    return HARPER_SECTION_IDS.standing;
  }
  return HARPER_SECTION_IDS.needsInfo;
}

export type HarperThreeSectionModel = {
  /** Requirement/topic rows for Section 1 (approved answers only under each). */
  standingEntries: StandingListEntry[];
  /** Approved why / career items as own Section 1 entries (also in standingEntries when topics). */
  needsInfoQuestions: ConsultationQaItem[];
  bestPracticeQuestions: ConsultationQaItem[];
  /** Map questionTurnId → section for anchors. */
  sectionByQuestionTurnId: Map<string, HarperPageSectionId>;
};

/**
 * Split standing list entries into the three Harper page sections.
 * Every question appears in exactly one section's question list.
 */
export function partitionHarperThreeSections(
  entries: StandingListEntry[],
): HarperThreeSectionModel {
  const needsInfoQuestions: ConsultationQaItem[] = [];
  const bestPracticeQuestions: ConsultationQaItem[] = [];
  const sectionByQuestionTurnId = new Map<string, HarperPageSectionId>();
  const seen = new Set<string>();

  function take(item: ConsultationQaItem): HarperPageSectionId {
    if (seen.has(item.questionTurnId)) {
      return sectionByQuestionTurnId.get(item.questionTurnId)!;
    }
    seen.add(item.questionTurnId);
    const section = harperSectionForQuestion(item);
    sectionByQuestionTurnId.set(item.questionTurnId, section);
    if (section === HARPER_SECTION_IDS.bestPractice) {
      bestPracticeQuestions.push(item);
    } else if (section === HARPER_SECTION_IDS.needsInfo) {
      needsInfoQuestions.push(item);
    }
    return section;
  }

  const standingEntries: StandingListEntry[] = [];

  for (const entry of entries) {
    const forStanding: ConsultationQaItem[] = [];
    for (const question of entry.questions) {
      const section = take(question);
      if (section === HARPER_SECTION_IDS.standing) {
        forStanding.push(question);
      }
    }

    // Keep requirement rows always; keep topic rows only when they have
    // approved answers (why / career). Role-expertise topics are emptied —
    // those questions live in Section 3 only.
    const isRoleTopic =
      entry.kind === "TOPIC" &&
      (entry.targetKey.startsWith(ROLE_EXPERTISE_TARGET_PREFIX) ||
        entry.targetKey.startsWith(ASK_HARPER_TARGET_PREFIX));
    if (isRoleTopic) {
      continue;
    }
    let questions = forStanding;
    if (entry.kind === "TOPIC") {
      const host = standingEntries.find(
        (row) =>
          row.kind !== "TOPIC" &&
          (row.targetKey === entry.targetKey ||
            row.mergedTargetKeys.includes(entry.targetKey)),
      );
      if (host) {
        const share = questions.filter(isStandingShareAnswer);
        questions = questions.filter((question) => !isStandingShareAnswer(question));
        if (share.length > 0) {
          for (const question of share) {
            if (
              !host.questions.some(
                (existing) => existing.questionTurnId === question.questionTurnId,
              )
            ) {
              host.questions.push(question);
            }
          }
          host.showShareForm = false;
        }
      }
      // Why / career still open as a Harper question → Section 2 only.
      if (questions.length === 0) continue;
    }
    standingEntries.push({
      ...entry,
      questions,
      // Share form stays on the requirement when no answer is showing there yet.
      showShareForm:
        entry.kind !== "TOPIC" &&
        entry.showShareForm &&
        questions.length === 0,
    });
  }

  // Any question that was not nested under an entry (should be rare) still
  // must appear once — classify orphans from all entry questions already covered.

  return {
    standingEntries,
    needsInfoQuestions,
    bestPracticeQuestions,
    sectionByQuestionTurnId,
  };
}

/** All question turn ids rendered across the three sections (render invariant). */
export function collectThreeSectionQuestionTurnIds(
  model: HarperThreeSectionModel,
): string[] {
  const ids: string[] = [];
  for (const entry of model.standingEntries) {
    for (const q of entry.questions) ids.push(q.questionTurnId);
  }
  for (const q of model.needsInfoQuestions) ids.push(q.questionTurnId);
  for (const q of model.bestPracticeQuestions) ids.push(q.questionTurnId);
  return ids;
}
