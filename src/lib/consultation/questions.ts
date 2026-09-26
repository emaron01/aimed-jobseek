import type { EvidenceAssessment } from "@/lib/consultation/assess";
import { openGaps, requirementMeaning } from "@/lib/consultation/assess";
import { consultationConfig, consultationConversationCopy } from "@/lib/product-config/consultation";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";

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

function targetMeaning(text: string): string {
  return requirementMeaning(text);
}

const UNSEEN_EXPERIENCE =
  /does not see|do not see|don't see|has not seen|hasn't seen|unseen experience/i;

export function unseenExperienceGapQuestion(requirement: string): string {
  return consultationConversationCopy.unseenExperienceGapQuestion.replace(
    "{requirement}",
    requirement.trim(),
  );
}

export function asksAboutUnseenExperience(text: string): boolean {
  return UNSEEN_EXPERIENCE.test(text);
}

export function questionTextForGap(
  gap: Pick<EvidenceAssessment, "key" | "text">,
  modelText?: string | null,
): string {
  if (gap.key === WHY_THIS_COMPANY_TARGET_KEY) {
    return (
      modelText?.trim() || consultationConversationCopy.whyThisCompanyQuestion
    );
  }
  const model = modelText?.trim() ?? "";
  if (model && asksAboutUnseenExperience(model)) return model;
  if (model) {
    return `${model} ${consultationConversationCopy.unseenExperienceFollowOn}`;
  }
  return unseenExperienceGapQuestion(gap.text);
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
    return {
      dropped: {
        targetKey: gap.key,
        reason: "The model did not return a question for this requirement.",
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
      whoCaresNote:
        modelQuestion?.whoCaresNote.trim() ||
        `${role.name} will hear the answer to this question.`,
    },
  };
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
  focusTargetKey?: string | null;
}): QuestionRoundPlan {
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
  const selectionLimit = consultationConfig.roundSize;
  for (const gap of gaps) {
    if (selected.length >= selectionLimit) break;
    const meaning = targetMeaning(gap.text);
    if (selectedMeanings.has(meaning)) continue;
    selected.push(gap);
    selectedMeanings.add(meaning);
  }
  const byKey = new Map(
    input.modelQuestions
      .filter((question) => question.text.trim())
      .map((question) => [question.targetKey, question]),
  );
  const rolesById = new Map(input.hiringTeam.map((role) => [role.id, role]));
  const questions: PlannedQuestion[] = [];
  const dropped: DroppedQuestion[] = [];
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
    questions.push(result.question);
  }
  if (
    input.includeChronology &&
    !input.chronologyAsked &&
    questions.length === 0
  ) {
    const modelQuestion = byKey.get("chronology");
    const role = modelQuestion
      ? rolesById.get(modelQuestion.hiringTeamRoleId)
      : null;
    if (!modelQuestion || !role) {
      dropped.push({
        targetKey: "chronology",
        reason: "The model did not return a chronology question.",
      });
    } else {
      questions.push({
        targetKey: "chronology",
        followUp: false,
        text: modelQuestion.text.trim(),
        requirementInterpretation:
          modelQuestion.requirementInterpretation?.trim() || null,
        hiringTeamRoleId: role.id,
        whoCaresNote: modelQuestion.whoCaresNote.trim(),
      });
    }
  }
  return {
    questions: questions.slice(0, consultationConfig.roundSize),
    dropped,
  };
}
