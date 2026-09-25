import type { EvidenceAssessment } from "@/lib/consultation/assess";
import { openGaps, requirementMeaning } from "@/lib/consultation/assess";
import { questionRestatesTarget } from "@/lib/consultation/output-quality";
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

const INTERNAL_STATE =
  /\b(?:research (?:status|is|isn't|has|hasn't|not|pending|incomplete|unavailable)|confidence(?: score)?|ambiguit(?:y|ies)|ambiguous|missing (?:data|information|context)|internal (?:state|system)|prompt|model (?:output|behavior|generation)|not configured)\b/i;

export function validModelQuestion(text: string): boolean {
  const cleaned = text.trim();
  return cleaned.length >= 20 && !INTERNAL_STATE.test(cleaned);
}

function targetMeaning(text: string): string {
  return requirementMeaning(text);
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

function asksForDates(text: string): boolean {
  return /\b(?:date|dates|when|from|started|ended|month|year)\b/i.test(text);
}

function asksForEstimate(text: string): boolean {
  return /\b(?:approximate(?:ly)?|roughly|estimate[ds]?)\b/i.test(text);
}

function canCalculateExperience(gap: EvidenceAssessment): boolean {
  const calculation = gap.experienceCalculation;
  return Boolean(
    calculation &&
      calculation.missingDateRoleIds.length === 0 &&
      calculation.periods.length > 0,
  );
}

function isDateOnlyQuestion(text: string): boolean {
  if (!asksForDates(text)) return false;
  return !/\b(?:used|use|which roles|where you|what did you|how did you)\b/i.test(
    text,
  );
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
  if (!modelQuestion && gap.key === WHY_THIS_COMPANY_TARGET_KEY) {
    const role = input.hiringTeam[0];
    if (!role) {
      return {
        dropped: {
          targetKey: gap.key,
          reason:
            "No hiring-team role was available to ask why this company matters, so that question was left for a later round.",
        },
      };
    }
    return {
      question: {
        targetKey: gap.key,
        followUp: false,
        text: consultationConversationCopy.whyThisCompanyQuestion,
        requirementInterpretation: null,
        hiringTeamRoleId: role.id,
        whoCaresNote: `${role.name} will hear why this company matters to the seeker.`,
      },
    };
  }
  if (!modelQuestion) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "A usable question was not written for this requirement, so it was left for a later round.",
      },
    };
  }
  const text = modelQuestion.text.trim();
  const role = input.rolesById.get(modelQuestion.hiringTeamRoleId);
  if (
    !role ||
    !modelQuestion.whoCaresNote.trim() ||
    !modelQuestion.whoCaresNote.toLowerCase().includes(role.name.toLowerCase())
  ) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "The question was not grounded in a hiring-team role, so it was left out of this round.",
      },
    };
  }
  if (
    modelQuestion.requirementInterpretation &&
    questionRestatesTarget(text, gap.text)
  ) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "The question repeated the job wording instead of asking for a concrete story, so it was left out of this round.",
      },
    };
  }
  if (canCalculateExperience(gap) && isDateOnlyQuestion(text)) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "Role dates already support a conservative years calculation, so a date-only question was not asked.",
      },
    };
  }
  if (asksForEstimate(text)) {
    return {
      dropped: {
        targetKey: gap.key,
        reason:
          "The question asked for an estimated duration instead of using the dates already in the profile, so it was left out of this round.",
      },
    };
  }
  return {
    question: {
      targetKey: gap.key,
      followUp: false,
      text,
      requirementInterpretation:
        modelQuestion.requirementInterpretation?.trim() || null,
      hiringTeamRoleId: role.id,
      whoCaresNote: modelQuestion.whoCaresNote.trim(),
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
      .filter((question) => validModelQuestion(question.text))
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
    if (
      !modelQuestion ||
      !role ||
      !modelQuestion.whoCaresNote.toLowerCase().includes(role.name.toLowerCase())
    ) {
      dropped.push({
        targetKey: "chronology",
        reason:
          "A usable chronology question was not written, so it was left out of this round.",
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
