import type { EvidenceAssessment } from "@/lib/consultation/assess";
import {
  openGaps,
  requirementMeaning,
  sameRequirementMeaning,
} from "@/lib/consultation/assess";
import {
  WHY_THIS_COMPANY_TARGET_KEY,
  type AskedConsultationQuestion,
} from "@/lib/consultation/contract";
import {
  looksLikeCareerWalkThrough,
  looksLikeContextFreeTemplateQuestion,
  questionIntentClass,
} from "@/lib/consultation/question-detection";
import { replyToTurnIdFromAnalysis, isIgnoredSeekerTurn } from "@/lib/consultation/qa-view";
import { consultationConfig } from "@/lib/product-config/consultation";

export {
  looksLikeCareerWalkThrough,
  looksLikeContextFreeTemplateQuestion,
  questionIntentClass,
} from "@/lib/consultation/question-detection";

export type PlannedQuestion = {
  targetKey: string;
  followUp: boolean;
  text: string;
  requirementInterpretation: string | null;
  hiringTeamRoleId: string;
  whoCaresNote: string;
};

export type DroppedQuestion = {
  targetKey: string;
  reason: string;
};

export type QuestionRoundPlan = {
  questions: PlannedQuestion[];
  dropped: DroppedQuestion[];
};

const SENIOR_ROLE =
  /\b(senior|staff|principal|director|lead|manager|head|vp|vice|executive|chief)\b/i;

export function seniorityWarrantsChronology(input: {
  seniority: string | null;
  title: string | null;
}): boolean {
  return SENIOR_ROLE.test(`${input.seniority ?? ""} ${input.title ?? ""}`);
}

export function validModelQuestion(text: string): boolean {
  return Boolean(text.trim());
}

function normalizedQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function questionNearDuplicate(left: string, right: string): boolean {
  const a = normalizedQuestion(left);
  const b = normalizedQuestion(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const leftIntent = questionIntentClass(left);
  const rightIntent = questionIntentClass(right);
  if (leftIntent && leftIntent === rightIntent) return true;
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length <= b.length ? a : b;
    if (shorter.length >= 24) return true;
  }
  return sameRequirementMeaning(left, right);
}

export function questionDuplicatesAsked(
  text: string,
  askedQuestions: readonly AskedConsultationQuestion[],
): boolean {
  return askedQuestions.some((asked) => questionNearDuplicate(text, asked.text));
}

export function askedQuestionsFromTurns(
  turns: Array<{
    id: string;
    speaker: "CONSULTANT" | "SEEKER";
    body: string;
    targetKey: string | null;
    followUp: boolean;
    skipped: boolean;
    intent?: string | null;
    analysisJson?: unknown;
  }>,
): AskedConsultationQuestion[] {
  const asked: AskedConsultationQuestion[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "CONSULTANT") continue;
    if (turn.intent === "CLOSING") continue;
    if (turn.intent === "COACHING") continue;
    const text = turn.body.trim();
    if (!text) continue;
    const ignored = turns.some(
      (reply) =>
        reply.speaker === "SEEKER" &&
        isIgnoredSeekerTurn(reply) &&
        (replyToTurnIdFromAnalysis(reply.analysisJson) === turn.id ||
          (!replyToTurnIdFromAnalysis(reply.analysisJson) &&
            Boolean(turn.targetKey) &&
            reply.targetKey === turn.targetKey)),
    );
    const answered =
      !ignored &&
      turns.some(
        (reply) =>
          reply.speaker === "SEEKER" &&
          !reply.skipped &&
          !isIgnoredSeekerTurn(reply) &&
          reply.body.trim().length > 0 &&
          (replyToTurnIdFromAnalysis(reply.analysisJson) === turn.id ||
            (!replyToTurnIdFromAnalysis(reply.analysisJson) &&
              Boolean(turn.targetKey) &&
              reply.targetKey === turn.targetKey)),
      );
    asked.push({
      text,
      answered,
      ignored,
      targetKey: turn.targetKey,
      followUp: turn.followUp,
    });
  }
  return asked;
}

function targetMeaning(text: string): string {
  return requirementMeaning(text);
}

export function looksLikeTemplatedUnseenQuestion(text: string): boolean {
  return /harper does not see/i.test(text);
}

export function questionNeedsRoleSource(input: {
  gapText: string;
  profileItems?: Array<{
    itemType?: string;
    title?: string | null;
    employer?: string | null;
    text: string;
  }>;
}): boolean {
  const mentionsYears = /\b\d+\s+years?\b/i.test(input.gapText);
  if (!mentionsYears && !/\bbackground\b/i.test(input.gapText)) return false;
  const tied = (input.profileItems ?? []).some(
    (item) =>
      item.itemType === "EXPERIENCE" &&
      Boolean(item.title?.trim() || item.employer?.trim()) &&
      sameRequirementMeaning(item.text, input.gapText),
  );
  return !tied;
}

type GapProfileItem = {
  itemType?: string;
  title?: string | null;
  employer?: string | null;
  text: string;
};

export function questionTextForGap(
  gap: Pick<EvidenceAssessment, "key" | "text">,
  modelText?: string | null,
): string {
  const written = modelText?.trim() ?? "";
  if (
    !written ||
    looksLikeTemplatedUnseenQuestion(written) ||
    looksLikeContextFreeTemplateQuestion(written)
  ) {
    return "";
  }
  return written;
}

export function matchConsultationFocus(input: {
  focusTargetKey?: string | null;
  focusNote?: string | null;
  targets: Array<{ key: string; text: string }>;
}): string | null {
  const keyed = input.focusTargetKey?.trim();
  if (keyed && input.targets.some((target) => target.key === keyed)) {
    return keyed;
  }
  const note = input.focusNote?.trim().toLowerCase() ?? "";
  if (!note) return null;
  const noteTokens = new Set(
    note
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
  let best: { key: string; score: number } | null = null;
  for (const target of input.targets) {
    const matched = target.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && noteTokens.has(token));
    const score = matched.length;
    const distinctive = matched.some((token) => token.length >= 6);
    if ((score >= 2 || (score >= 1 && distinctive)) && (!best || score > best.score)) {
      best = { key: target.key, score };
    }
  }
  return best?.key ?? null;
}

function questionForGap(input: {
  gap: EvidenceAssessment;
  modelQuestion:
    | {
        targetKey: string;
        text: string;
        requirementInterpretation: string | null;
        hiringTeamRoleId: string;
        whoCaresNote: string;
      }
    | undefined;
  hiringTeam: Array<{ id: string; name: string }>;
  rolesById: Map<string, { id: string; name: string }>;
}): { question: PlannedQuestion } | { dropped: DroppedQuestion } {
  const { gap, modelQuestion } = input;
  const role =
    (modelQuestion
      ? input.rolesById.get(modelQuestion.hiringTeamRoleId)
      : undefined) ?? input.hiringTeam[0];
  if (!role) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "No hiring-team role was available to attach this question to.",
      },
    };
  }
  const text = questionTextForGap(gap, modelQuestion?.text);
  if (!text) {
    const raw = modelQuestion?.text?.trim() ?? "";
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          raw && looksLikeContextFreeTemplateQuestion(raw)
            ? "Context-free template question was rejected."
            : "The model did not return a question for this requirement.",
      },
    };
  }
  return {
    question: {
      targetKey: gap.key,
      followUp: false,
      text,
      requirementInterpretation:
        modelQuestion?.requirementInterpretation?.trim() || null,
      hiringTeamRoleId: role.id,
      whoCaresNote: modelQuestion?.whoCaresNote.trim() || "",
    },
  };
}

export function selectGapsForRound(input: {
  assessments: EvidenceAssessment[];
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  focusTargetKey?: string | null;
  remainingQuestionSlots?: number;
}): EvidenceAssessment[] {
  const askedKeys = new Set(input.askedKeys);
  if (input.focusTargetKey) askedKeys.delete(input.focusTargetKey);
  const coveredMeanings = new Set(
    input.assessments
      .filter(
        (assessment) =>
          askedKeys.has(assessment.key) ||
          input.skippedKeys.has(assessment.key),
      )
      .map((assessment) => targetMeaning(assessment.text)),
  );
  const gaps = openGaps(input.assessments).filter(
    (gap) =>
      !askedKeys.has(gap.key) &&
      !input.skippedKeys.has(gap.key) &&
      !coveredMeanings.has(targetMeaning(gap.text)),
  );
  const focus = input.focusTargetKey
    ? input.assessments.find(
        (assessment) =>
          assessment.key === input.focusTargetKey &&
          assessment.strength !== "STRONG",
      )
    : undefined;
  if (focus) {
    if (!gaps.some((gap) => gap.key === focus.key)) {
      gaps.unshift(focus);
    } else {
      const remaining = gaps.filter((gap) => gap.key !== focus.key);
      gaps.splice(0, gaps.length, focus, ...remaining);
    }
  } else {
    const why = gaps.find((gap) => gap.key === WHY_THIS_COMPANY_TARGET_KEY);
    if (why) {
      const remaining = gaps.filter((gap) => gap.key !== WHY_THIS_COMPANY_TARGET_KEY);
      gaps.splice(0, gaps.length, why, ...remaining);
    }
  }
  const selected: EvidenceAssessment[] = [];
  const selectedMeanings = new Set<string>();
  const selectionLimit = Math.min(
    consultationConfig.roundSize,
    input.remainingQuestionSlots ?? consultationConfig.applicationQuestionLimit,
  );
  for (const gap of gaps) {
    if (selected.length >= selectionLimit) break;
    const meaning = targetMeaning(gap.text);
    if (selectedMeanings.has(meaning)) continue;
    selected.push(gap);
    selectedMeanings.add(meaning);
  }
  return selected;
}

export function planQuestionRound(input: {
  assessments: EvidenceAssessment[];
  modelQuestions: Array<{
    targetKey: string;
    text: string;
    requirementInterpretation: string | null;
    hiringTeamRoleId: string;
    whoCaresNote: string;
  }>;
  hiringTeam: Array<{ id: string; name: string }>;
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  includeChronology: boolean;
  chronologyAsked: boolean;
  askedQuestions?: readonly AskedConsultationQuestion[];
  focusTargetKey?: string | null;
  profileItems?: GapProfileItem[];
}): QuestionRoundPlan {
  const askedQuestions = input.askedQuestions ?? [];
  const remainingQuestionSlots = Math.max(
    0,
    consultationConfig.applicationQuestionLimit - askedQuestions.length,
  );
  const selected = selectGapsForRound({
    assessments: input.assessments,
    askedKeys: input.askedKeys,
    skippedKeys: input.skippedKeys,
    focusTargetKey: input.focusTargetKey,
    remainingQuestionSlots,
  });
  const byKey = new Map(
    input.modelQuestions
      .filter((question) => question.text.trim())
      .filter((question) => !questionDuplicatesAsked(question.text, askedQuestions))
      .map((question) => [question.targetKey, question]),
  );
  const rolesById = new Map(input.hiringTeam.map((role) => [role.id, role]));
  const questions: PlannedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
  if (remainingQuestionSlots === 0) {
    return { questions, dropped };
  }
  for (const gap of selected) {
    const result = questionForGap({
      gap,
      modelQuestion: byKey.get(gap.key),
      hiringTeam: input.hiringTeam,
      rolesById,
    });
    if ("dropped" in result) {
      dropped.push(result.dropped);
      continue;
    }
    if (questionDuplicatesAsked(result.question.text, askedQuestions)) {
      dropped.push({
        targetKey: gap.key,
        reason: "already-asked",
      });
      continue;
    }
    questions.push(result.question);
  }
  // At most one career walk-through per application (intent class, not employer tokens).
  let walkThroughKept = askedQuestions.some(
    (question) =>
      question.targetKey === "chronology" ||
      looksLikeCareerWalkThrough(question.text),
  );
  if (input.chronologyAsked) walkThroughKept = true;
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]!;
    if (!looksLikeCareerWalkThrough(question.text)) continue;
    if (!walkThroughKept) {
      walkThroughKept = true;
      continue;
    }
    dropped.push({
      targetKey: question.targetKey,
      reason: "already-asked",
    });
    questions.splice(index, 1);
    index -= 1;
  }
  const chronologyAlreadyAsked = walkThroughKept;
  if (
    input.includeChronology &&
    !chronologyAlreadyAsked &&
    questions.length === 0
  ) {
    const modelQuestion = byKey.get("chronology");
    const role = modelQuestion
      ? rolesById.get(modelQuestion.hiringTeamRoleId)
      : null;
    const chronologyText = modelQuestion?.text.trim() ?? "";
    if (!modelQuestion || !role) {
      dropped.push({
        targetKey: "chronology",
        reason: "The model did not return a chronology question.",
      });
    } else if (looksLikeContextFreeTemplateQuestion(chronologyText)) {
      dropped.push({
        targetKey: "chronology",
        reason: "Context-free template question was rejected.",
      });
    } else if (questionDuplicatesAsked(chronologyText, askedQuestions)) {
      dropped.push({
        targetKey: "chronology",
        reason: "already-asked",
      });
    } else {
      questions.push({
        targetKey: "chronology",
        followUp: false,
        text: chronologyText,
        requirementInterpretation:
          modelQuestion.requirementInterpretation?.trim() || null,
        hiringTeamRoleId: role.id,
        whoCaresNote: modelQuestion.whoCaresNote.trim(),
      });
    }
  }
  return {
    questions: questions.slice(0, remainingQuestionSlots),
    dropped,
  };
}
