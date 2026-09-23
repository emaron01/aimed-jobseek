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

const INTERNAL_STATE =
  /\b(?:research (?:status|is|isn't|has|hasn't|not|pending|incomplete|unavailable)|confidence(?: score)?|ambiguit(?:y|ies)|ambiguous|missing (?:data|information|context)|internal (?:state|system)|prompt|model (?:output|behavior|generation)|not configured)\b/i;

export function validModelQuestion(text: string): boolean {
  const cleaned = text.trim();
  return cleaned.length >= 20 && !INTERNAL_STATE.test(cleaned);
}

function targetMeaning(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function planQuestionRound(input: {
  assessments: EvidenceAssessment[];
  modelQuestions: Array<{ targetKey: string; text: string }>;
  askedKeys: ReadonlySet<string>;
  skippedKeys: ReadonlySet<string>;
  includeChronology: boolean;
  chronologyAsked: boolean;
}): PlannedQuestion[] {
  const coveredMeanings = new Set(
    input.assessments
      .filter(
        (assessment) =>
          input.askedKeys.has(assessment.key) ||
          input.skippedKeys.has(assessment.key),
      )
      .map((assessment) => targetMeaning(assessment.text)),
  );
  const gaps = openGaps(input.assessments).filter(
    (gap) =>
      !input.askedKeys.has(gap.key) &&
      !input.skippedKeys.has(gap.key) &&
      !coveredMeanings.has(targetMeaning(gap.text)),
  );
  const room = input.includeChronology && !input.chronologyAsked
    ? consultationConfig.roundSize - 1
    : consultationConfig.roundSize;
  const selected: EvidenceAssessment[] = [];
  const selectedMeanings = new Set<string>();
  const selectionLimit = Math.max(room, 0);
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
      .map((question) => [question.targetKey, question.text.trim()]),
  );
  const questions: PlannedQuestion[] = selected.map((gap) => {
    const text = byKey.get(gap.key);
    if (!text) {
      throw new Error(`Consultation AI did not write a valid question for ${gap.key}.`);
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
    return {
      targetKey: gap.key,
      followUp: false,
      text,
    };
  });
  if (input.includeChronology && !input.chronologyAsked) {
    const text = byKey.get("chronology");
    if (!text) {
      throw new Error("Consultation AI did not write a valid chronology question.");
    }
    questions.push({
      targetKey: "chronology",
      followUp: false,
      text,
    });
  }
  return questions.slice(0, consultationConfig.roundSize);
}
