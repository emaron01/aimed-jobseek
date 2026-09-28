import {
  consultationQuestionAcceptsReply,
  type ConsultationQaItem,
} from "@/lib/consultation/qa-view";
import {
  CHEAT_SHEET_TARGET_PREFIX,
  CHRONOLOGY_TARGET_KEY,
  ROLE_EXPERTISE_TARGET_PREFIX,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";
import { contactIdFromPersonPrepTarget } from "@/lib/interview/person-prep";
import type { ConsultationGapStatus } from "@/lib/consultation/standing";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

/** Stable URL fragment ids — ids appear only in the fragment, never as visible text. */
export const HARPER_STANDING_ANCHOR = "harper-standing";
/** Alias for Where you stand topics root (was the free-floating General list before B2). */
export const HARPER_GENERAL_ANCHOR = "harper-general";

export function harperContactAnchorId(contactId: string): string {
  return `harper-contact:${contactId}`;
}

export function harperQuestionAnchorId(questionTurnId: string): string {
  return `harper-q:${questionTurnId}`;
}

/**
 * Stable URL fragment for a cheat-sheet coach item on Harper's person view
 * (before or without a ConsultationTurn). Ids appear only in the fragment.
 */
export function harperCoachItemAnchorId(coachItemId: string): string {
  return `harper-coach:${coachItemId}`;
}

/**
 * Coach item ids are `{sectionKey}:likely:1` etc. Person sections use
 * `contact:{contactId}` (`assignCoachItemIds` / `buildCheatSheetPeople`).
 * Returns null for overview gaps and legacy `role:` sections (no contact).
 */
export function contactIdFromCheatSheetTarget(
  targetKey: string | null | undefined,
): string | null {
  const key = targetKey?.trim() ?? "";
  if (!key.startsWith(CHEAT_SHEET_TARGET_PREFIX)) return null;
  const itemId = key.slice(CHEAT_SHEET_TARGET_PREFIX.length);
  if (!itemId.startsWith("contact:")) return null;
  const contactId = itemId.slice("contact:".length).split(":")[0]?.trim() ?? "";
  return contactId || null;
}

/** Item id after `cheatSheet:` — e.g. `contact:c1:likely:1`. */
export function coachItemIdFromCheatSheetTarget(
  targetKey: string | null | undefined,
): string | null {
  const key = targetKey?.trim() ?? "";
  if (!key.startsWith(CHEAT_SHEET_TARGET_PREFIX)) return null;
  const itemId = key.slice(CHEAT_SHEET_TARGET_PREFIX.length).trim();
  return itemId || null;
}

/**
 * Person-view QuestionList: keep person-prep (and any cheatSheet items not already
 * shown under the profile's likelyQuestions). Profile-owned coach turns render once
 * under CheatSheetCoachItems / QuestionCard in the profile.
 */
export function personViewListQuestions(input: {
  questions: ConsultationQaItem[];
  profileCoachItemIds: Iterable<string>;
}): ConsultationQaItem[] {
  const profileIds = new Set(
    [...input.profileCoachItemIds].map((id) => id.trim()).filter(Boolean),
  );
  return input.questions.filter((item) => {
    const coachId = coachItemIdFromCheatSheetTarget(item.targetKey);
    if (!coachId) return true;
    return !profileIds.has(coachId);
  });
}

/**
 * Company-level cheat-sheet gaps (`cheatSheet:overview:gap:{n}`).
 * Every persona is at the same company — general prep under Where you stand.
 */
export function isOverviewGapCheatSheetTarget(
  targetKey: string | null | undefined,
): boolean {
  const key = targetKey?.trim() ?? "";
  if (!key.startsWith(CHEAT_SHEET_TARGET_PREFIX)) return false;
  const itemId = key.slice(CHEAT_SHEET_TARGET_PREFIX.length);
  return itemId.startsWith("overview:gap:");
}

/** Requirement-like assessment keys that can appear under Where you stand. */
export function isRequirementLikeTargetKey(targetKey: string): boolean {
  return /^(required|outcome|competency|preferred|mission):/.test(targetKey.trim());
}

/** True when the item must appear somewhere on Harper (answers, statements, or open Q). */
export function harperItemNeedsRender(item: ConsultationQaItem): boolean {
  if (item.ignored) return true;
  if (consultationQuestionAcceptsReply(item)) return true;
  if (item.seekerAnswers.length > 0) return true;
  if (item.statements.length > 0) return true;
  if (item.resumeBullet || item.talkingPoint) return true;
  return false;
}

export type HarperInterviewerSection = {
  contactId: string;
  heading: string;
  questions: ConsultationQaItem[];
};

export type HarperQaLayout = {
  general: ConsultationQaItem[];
  interviewers: HarperInterviewerSection[];
};

export type HarperInterviewerOrderItem = {
  contactId: string;
  heading: string;
  /** Earliest Stage scheduledAt for this contact; null if not on a stage. */
  sortAt: number | null;
};

export type StandingInlineTopicKind =
  | "why-this-company"
  | "chronology"
  | "role-expertise"
  | "requirement";

export type StandingInlineTopic = {
  kind: StandingInlineTopicKind;
  targetKey: string;
  label: string;
  questions: ConsultationQaItem[];
};

export type StandingInlinePartition = {
  /** Dedicated topics (why / chronology / role-expertise) with at least one question. */
  dedicatedTopics: StandingInlineTopic[];
  /** Questions keyed by standing requirement targetKey. */
  byRequirementKey: Map<string, ConsultationQaItem[]>;
  /**
   * Requirement-like keys no longer in the standing list, with seeker content /
   * open questions — render under Where you stand without a rating.
   */
  orphanedRequirementTopics: StandingInlineTopic[];
  /**
   * Leftovers that cannot be placed under a requirement, dedicated topic, or
   * interviewer — report-only / STOP for PO; never rendered as "Other".
   */
  unmapped: ConsultationQaItem[];
};

function isOpenQuestion(item: ConsultationQaItem): boolean {
  return consultationQuestionAcceptsReply(item);
}

/** Open questions first, then answered — stable by original order within each group. */
export function sortQuestionsOpenFirst(
  questions: ConsultationQaItem[],
): ConsultationQaItem[] {
  const open: ConsultationQaItem[] = [];
  const answered: ConsultationQaItem[] = [];
  for (const item of questions) {
    if (isOpenQuestion(item)) open.push(item);
    else answered.push(item);
  }
  return [...open, ...answered];
}

/**
 * General = not assigned to an interviewer. Interviewer sections get person-prep
 * and cheatSheet:contact:… items (Stage date order, then any other contacts).
 */
export function buildHarperQaLayout(input: {
  questions: ConsultationQaItem[];
  interviewers: HarperInterviewerOrderItem[];
}): HarperQaLayout {
  const general: ConsultationQaItem[] = [];
  const byContact = new Map<string, ConsultationQaItem[]>();

  for (const item of input.questions) {
    const contactId =
      contactIdFromPersonPrepTarget(item.targetKey) ??
      contactIdFromCheatSheetTarget(item.targetKey);
    if (!contactId) {
      general.push(item);
      continue;
    }
    const list = byContact.get(contactId) ?? [];
    list.push(item);
    byContact.set(contactId, list);
  }

  const orderedIds: string[] = [];
  const headingById = new Map<string, string>();
  const sortedInterviewers = [...input.interviewers].sort((left, right) => {
    if (left.sortAt == null && right.sortAt == null) {
      return left.contactId.localeCompare(right.contactId);
    }
    if (left.sortAt == null) return 1;
    if (right.sortAt == null) return -1;
    if (left.sortAt !== right.sortAt) return left.sortAt - right.sortAt;
    return left.contactId.localeCompare(right.contactId);
  });
  for (const interviewer of sortedInterviewers) {
    orderedIds.push(interviewer.contactId);
    headingById.set(interviewer.contactId, interviewer.heading);
  }
  for (const contactId of byContact.keys()) {
    if (!headingById.has(contactId)) {
      orderedIds.push(contactId);
      headingById.set(contactId, "Interviewer");
    }
  }

  const interviewers: HarperInterviewerSection[] = [];
  for (const contactId of orderedIds) {
    const questions = sortQuestionsOpenFirst(byContact.get(contactId) ?? []);
    if (questions.length === 0 && !input.interviewers.some((row) => row.contactId === contactId)) {
      continue;
    }
    if (questions.length === 0) continue;
    interviewers.push({
      contactId,
      heading: headingById.get(contactId) ?? "Interviewer",
      questions,
    });
  }

  return {
    general: sortQuestionsOpenFirst(general),
    interviewers,
  };
}

/**
 * Maps former General-thread questions onto Where you stand topics.
 * Does not invent an "Other" bucket — leftovers go to `unmapped` for reporting.
 * Role-expertise keys are reserved for Batch D; topics render only when questions exist.
 */
export function partitionGeneralQuestionsForStanding(input: {
  general: ConsultationQaItem[];
  requirementTargetKeys: Iterable<string>;
  /** Labels for requirement-like keys (all assessments, including non-standing). */
  requirementLabels?: ReadonlyMap<string, string> | Record<string, string>;
}): StandingInlinePartition {
  const requirementKeys = new Set(
    [...input.requirementTargetKeys].map((key) => key.trim()).filter(Boolean),
  );
  const labels =
    input.requirementLabels instanceof Map
      ? input.requirementLabels
      : new Map(
          Object.entries(input.requirementLabels ?? {}).map(([key, value]) => [
            key,
            value,
          ]),
        );
  const why: ConsultationQaItem[] = [];
  const chronology: ConsultationQaItem[] = [];
  const roleByKey = new Map<string, ConsultationQaItem[]>();
  const byRequirementKey = new Map<string, ConsultationQaItem[]>();
  const orphanedByKey = new Map<string, ConsultationQaItem[]>();
  const unmapped: ConsultationQaItem[] = [];

  for (const item of input.general) {
    const key = item.targetKey?.trim() ?? "";
    if (key === WHY_THIS_COMPANY_TARGET_KEY) {
      why.push(item);
      continue;
    }
    if (key === CHRONOLOGY_TARGET_KEY) {
      chronology.push(item);
      continue;
    }
    if (key.startsWith(ROLE_EXPERTISE_TARGET_PREFIX)) {
      const list = roleByKey.get(key) ?? [];
      list.push(item);
      roleByKey.set(key, list);
      continue;
    }
    if (key && requirementKeys.has(key)) {
      const list = byRequirementKey.get(key) ?? [];
      list.push(item);
      byRequirementKey.set(key, list);
      continue;
    }
    if (key && isRequirementLikeTargetKey(key) && harperItemNeedsRender(item)) {
      const list = orphanedByKey.get(key) ?? [];
      list.push(item);
      orphanedByKey.set(key, list);
      continue;
    }
    // Overview gaps: same standing treatment as dropped requirements (no rating).
    if (isOverviewGapCheatSheetTarget(key) && harperItemNeedsRender(item)) {
      const list = orphanedByKey.get(key) ?? [];
      list.push(item);
      orphanedByKey.set(key, list);
      continue;
    }
    unmapped.push(item);
  }

  const dedicatedTopics: StandingInlineTopic[] = [];
  if (why.length > 0) {
    dedicatedTopics.push({
      kind: "why-this-company",
      targetKey: WHY_THIS_COMPANY_TARGET_KEY,
      label: consultationConversationCopy.whyThisCompanyTarget,
      questions: sortQuestionsOpenFirst(why),
    });
  }
  if (chronology.length > 0) {
    dedicatedTopics.push({
      kind: "chronology",
      targetKey: CHRONOLOGY_TARGET_KEY,
      label: consultationConversationCopy.careerWalkThroughTarget,
      questions: sortQuestionsOpenFirst(chronology),
    });
  }
  for (const [targetKey, questions] of [...roleByKey.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (questions.length === 0) continue;
    dedicatedTopics.push({
      kind: "role-expertise",
      targetKey,
      label: questions[0]?.question?.trim() || targetKey,
      questions: sortQuestionsOpenFirst(questions),
    });
  }

  const orphanedRequirementTopics: StandingInlineTopic[] = [...orphanedByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([targetKey, questions]) => ({
      kind: "requirement" as const,
      targetKey,
      label:
        labels.get(targetKey)?.trim() ||
        questions[0]?.question?.trim() ||
        targetKey,
      questions: sortQuestionsOpenFirst(questions),
    }));

  return {
    dedicatedTopics,
    byRequirementKey: new Map(
      [...byRequirementKey.entries()].map(([key, questions]) => [
        key,
        sortQuestionsOpenFirst(questions),
      ]),
    ),
    orphanedRequirementTopics,
    unmapped,
  };
}

/** Question turn ids that the Harper page will render from layout + standing partition. */
export function collectRenderedHarperQuestionTurnIds(input: {
  interviewers: HarperInterviewerSection[];
  dedicatedTopics: StandingInlineTopic[];
  byRequirementKey: Map<string, ConsultationQaItem[]> | Iterable<[string, ConsultationQaItem[]]>;
  orphanedRequirementTopics: StandingInlineTopic[];
}): string[] {
  const ids: string[] = [];
  for (const section of input.interviewers) {
    for (const item of section.questions) ids.push(item.questionTurnId);
  }
  for (const topic of input.dedicatedTopics) {
    for (const item of topic.questions) ids.push(item.questionTurnId);
  }
  const requirementEntries =
    input.byRequirementKey instanceof Map
      ? input.byRequirementKey.entries()
      : input.byRequirementKey;
  for (const [, questions] of requirementEntries) {
    for (const item of questions) ids.push(item.questionTurnId);
  }
  for (const topic of input.orphanedRequirementTopics) {
    for (const item of topic.questions) ids.push(item.questionTurnId);
  }
  return ids;
}

/**
 * Render-time invariant: every item with seeker content / open question appears
 * exactly once among rendered slots. Unmapped leftovers that still need render
 * are returned as `missing` (STOP cases for PO — never an "Other" section).
 */
export function harperContentRenderCoverage(input: {
  questions: ConsultationQaItem[];
  renderedQuestionTurnIds: Iterable<string>;
}): {
  ok: boolean;
  missing: ConsultationQaItem[];
  duplicates: string[];
  neededTurnIds: string[];
} {
  const needed = input.questions.filter(harperItemNeedsRender);
  const neededTurnIds = needed.map((item) => item.questionTurnId);
  const rendered = [...input.renderedQuestionTurnIds];
  const renderedSet = new Set(rendered);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of rendered) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const missing = needed.filter((item) => !renderedSet.has(item.questionTurnId));
  return {
    ok: missing.length === 0 && duplicates.length === 0,
    missing,
    duplicates,
    neededTurnIds,
  };
}

export type OpenGapAnswerMapping = {
  targetKey: string;
  label: string;
  status: ConsultationGapStatus;
  strength?: "STRONG" | "PARTIAL" | "NONE";
  questionTurnId: string | null;
  answerableViaQuestion: boolean;
};

/**
 * Maps standing open / Partial requirements to an answerable Harper question.
 * A question is answerable when it accepts reply (open / follow-up) or already
 * has seeker answers (Edit / add path on the question card).
 */
export function mapOpenGapsToAnswerableQuestions(input: {
  gaps: Array<{
    targetKey: string;
    label: string;
    status: ConsultationGapStatus;
  }>;
  requirements: Array<{
    targetKey?: string;
    id?: string;
    text: string;
    strength: "STRONG" | "PARTIAL" | "NONE";
    gapStatus: ConsultationGapStatus | null;
  }>;
  questions: ConsultationQaItem[];
}): {
  mappings: OpenGapAnswerMapping[];
  gapsWithoutAnswerableQuestion: OpenGapAnswerMapping[];
} {
  const byTarget = new Map<string, ConsultationQaItem[]>();
  for (const item of input.questions) {
    if (!item.targetKey) continue;
    const list = byTarget.get(item.targetKey) ?? [];
    list.push(item);
    byTarget.set(item.targetKey, list);
  }

  function answerableFor(targetKey: string): {
    questionTurnId: string | null;
    answerableViaQuestion: boolean;
  } {
    const matches = byTarget.get(targetKey) ?? [];
    const replyable = matches.find(
      (item) =>
        consultationQuestionAcceptsReply(item) || item.seekerAnswers.length > 0,
    );
    if (replyable) {
      return {
        questionTurnId: replyable.questionTurnId,
        answerableViaQuestion: true,
      };
    }
    return { questionTurnId: matches[0]?.questionTurnId ?? null, answerableViaQuestion: false };
  }

  const seen = new Set<string>();
  const mappings: OpenGapAnswerMapping[] = [];

  for (const gap of input.gaps) {
    if (gap.status !== "open") continue;
    seen.add(gap.targetKey);
    const resolved = answerableFor(gap.targetKey);
    mappings.push({
      targetKey: gap.targetKey,
      label: gap.label,
      status: gap.status,
      ...resolved,
    });
  }

  for (const requirement of input.requirements) {
    const targetKey = requirement.targetKey;
    if (!targetKey || seen.has(targetKey)) continue;
    const needsAnswer =
      requirement.strength === "PARTIAL" ||
      requirement.gapStatus === "open";
    if (!needsAnswer) continue;
    seen.add(targetKey);
    const resolved = answerableFor(targetKey);
    mappings.push({
      targetKey,
      label: requirement.text,
      status: requirement.gapStatus ?? "open",
      strength: requirement.strength,
      ...resolved,
    });
  }

  return {
    mappings,
    gapsWithoutAnswerableQuestion: mappings.filter(
      (row) => !row.answerableViaQuestion,
    ),
  };
}

/** True when every open / Partial standing item has an answerable question elsewhere. */
export function standingFormsSafeToRemove(input: {
  gaps: Array<{
    targetKey: string;
    label: string;
    status: ConsultationGapStatus;
  }>;
  requirements: Array<{
    targetKey?: string;
    text: string;
    strength: "STRONG" | "PARTIAL" | "NONE";
    gapStatus: ConsultationGapStatus | null;
  }>;
  questions: ConsultationQaItem[];
}): boolean {
  return (
    mapOpenGapsToAnswerableQuestions(input).gapsWithoutAnswerableQuestion
      .length === 0
  );
}
