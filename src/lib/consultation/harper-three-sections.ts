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
 * Section assignment for a question (exactly one section).
 * Role-expertise → always Section 3.
 * Why / career / requirement gaps → Section 2 until APPROVED, then Section 1.
 */
export function harperSectionForQuestion(
  item: ConsultationQaItem,
): HarperPageSectionId {
  if (isRoleExpertiseQuestion(item) || isApprovedAskHarperQuestion(item)) {
    return HARPER_SECTION_IDS.bestPractice;
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
    if (entry.kind === "TOPIC" && forStanding.length === 0) {
      // Why / career still open → Section 2 only; do not show empty topic in S1.
      continue;
    }
    standingEntries.push({
      ...entry,
      questions: forStanding,
      // Share form stays on the requirement when no open inline question remains
      // in Section 1 and the gap still needs seeker input.
      showShareForm:
        entry.kind !== "TOPIC" &&
        entry.showShareForm &&
        forStanding.length === 0,
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
