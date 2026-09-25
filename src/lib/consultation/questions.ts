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
}): PlannedQuestion[] {
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
        (assessment) => assessment.key === input.focusTargetKey,
      )
    : undefined;
  if (focus && !gaps.some((gap) => gap.key === focus.key)) {
    gaps.unshift(focus);
  } else if (focus) {
    const remaining = gaps.filter((gap) => gap.key !== focus.key);
    gaps.splice(0, gaps.length, focus, ...remaining);
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
  for (const gap of selected) {
    const modelQuestion = byKey.get(gap.key);
    if (!modelQuestion && gap.key === WHY_THIS_COMPANY_TARGET_KEY) {
      const role = input.hiringTeam[0];
      if (!role) {
        throw new Error(
          `Consultation AI did not write a valid question for ${gap.key}.`,
        );
      }
      questions.push({
        targetKey: gap.key,
        followUp: false,
        text: consultationConversationCopy.whyThisCompanyQuestion,
        requirementInterpretation: null,
        hiringTeamRoleId: role.id,
        whoCaresNote: `${role.name} will hear why this company matters to the seeker.`,
      });
      continue;
    }
    if (!modelQuestion) {
      throw new Error(`Consultation AI did not write a valid question for ${gap.key}.`);
    }
    const text = modelQuestion.text.trim();
    const role = rolesById.get(modelQuestion.hiringTeamRoleId);
    if (
      !role ||
      !modelQuestion.whoCaresNote.trim() ||
      !modelQuestion.whoCaresNote.toLowerCase().includes(role.name.toLowerCase())
    ) {
      throw new Error(
        `Consultation AI did not ground the who-cares note for ${gap.key} in a Hiring Team role.`,
      );
    }
    if (
      modelQuestion.requirementInterpretation &&
      questionRestatesTarget(text, gap.text)
    ) {
      throw new Error(
        `Consultation AI repeated a vague requirement instead of translating ${gap.key}.`,
      );
    }
    if (
      gap.experienceCalculation?.missingDateRoleIds.length &&
      !/\b(?:date|dates|when|from|started|ended|month|year)\b/i.test(text)
    ) {
      throw new Error(
        `Consultation AI did not ask for the missing role dates for ${gap.key}.`,
      );
    }
    if (
      gap.experienceCalculation &&
      /\b(?:approximate(?:ly)?|roughly|estimate[ds]?)\b/i.test(text)
    ) {
      throw new Error(
        `Consultation AI asked for an estimated duration instead of exact dates for ${gap.key}.`,
      );
    }
    questions.push({
      targetKey: gap.key,
      followUp: false,
      text,
      requirementInterpretation:
        modelQuestion.requirementInterpretation?.trim() || null,
      hiringTeamRoleId: role.id,
      whoCaresNote: modelQuestion.whoCaresNote.trim(),
    });
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
      throw new Error("Consultation AI did not write a valid chronology question.");
    }
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
  return questions.slice(0, consultationConfig.roundSize);
}
