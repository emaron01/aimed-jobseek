import type {
  AnswerFramework,
  ConsultationPolishResult,
} from "@/lib/consultation/contract";
import { isConsultationPolishPartsResult } from "@/lib/consultation/contract";

/** Additive groundingJson shape for INTERVIEW_ANSWER statements (Batch D3). */
export type AnswerPartsGrounding = {
  answerFramework: AnswerFramework;
  challenge?: string;
  situation?: string;
  task?: string;
  action: string;
  result: string;
};

export type NormalizedPolishAnswer = {
  interviewAnswer: string;
  resumeBullet: string | null;
  strengtheningNote: string | null;
  answerPartsGrounding: AnswerPartsGrounding | null;
};

/**
 * Join framework parts into one natural first-person answer.
 * Ensures sentence boundaries; never inserts part labels or framework names.
 */
export function composeInterviewAnswerFromParts(parts: string[]): string {
  const cleaned = parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (cleaned.length === 0) return "";
  return cleaned
    .map((part) => {
      if (/[.!?]"?$/.test(part)) return part;
      return `${part}.`;
    })
    .join(" ");
}

export function partsInFrameworkOrder(
  result: ConsultationPolishResult & { answerFramework: AnswerFramework },
): string[] {
  if (result.answerFramework === "CAR") {
    return [result.challenge ?? "", result.action ?? "", result.result ?? ""];
  }
  return [
    result.situation ?? "",
    result.task ?? "",
    result.action ?? "",
    result.result ?? "",
  ];
}

export function answerPartsGroundingFromPolish(
  result: ConsultationPolishResult & { answerFramework: AnswerFramework },
): AnswerPartsGrounding {
  if (result.answerFramework === "CAR") {
    return {
      answerFramework: "CAR",
      challenge: (result.challenge ?? "").trim(),
      action: (result.action ?? "").trim(),
      result: (result.result ?? "").trim(),
    };
  }
  return {
    answerFramework: "STAR",
    situation: (result.situation ?? "").trim(),
    task: (result.task ?? "").trim(),
    action: (result.action ?? "").trim(),
    result: (result.result ?? "").trim(),
  };
}

/**
 * Lenient result check (Batch D3 PO): present, non-empty, and states what
 * changed or happened because of the action. Never requires a number/metric.
 */
export function resultStatesOutcome(result: string): boolean {
  const text = result.trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  // A qualitative outcome needs at least a short clause; digits are never required.
  return words.length >= 4;
}

/** Detect framework names or part labels leaked into polished fields. */
export function containsFrameworkOrPartLabel(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (
    /(?:^|[\n.!?]\s*)(?:Challenge|Situation|Task|Action|Result)\s*:/im.test(
      value,
    )
  ) {
    return true;
  }
  // Uppercase acronyms only so ordinary words like "car" / "star" do not fail.
  if (/\bCAR\b/.test(value) || /\bSTAR\b/.test(value)) return true;
  return false;
}

function blankPartFeedback(field: string): string {
  return `The ${field} part was missing or empty. Return a non-empty ${field} field.`;
}

function fieldText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Validate a polish model result for the quality loop.
 * Exceptions (whyThisCompany / confirmedGap) require a single interviewAnswer.
 * Otherwise require CAR/STAR parts, lenient result, and no labels.
 */
export function validatePolishPartsQuality(input: {
  data: ConsultationPolishResult;
  whyThisCompany: boolean;
  confirmedGap: boolean;
  maxWords: number;
}): string[] {
  const issues: string[] = [];
  const exception = input.whyThisCompany || input.confirmedGap;

  if (exception) {
    if (isConsultationPolishPartsResult(input.data)) {
      issues.push(
        "For this answer return a single interviewAnswer field with no answerFramework or parts.",
      );
      return issues;
    }
    const answer = fieldText(input.data.interviewAnswer);
    if (!answer) {
      issues.push("The interview answer was empty.");
      return issues;
    }
    if (containsFrameworkOrPartLabel(answer)) {
      issues.push(
        "Do not name CAR, STAR, or label parts (Challenge:, Situation:, Task:, Action:, Result:) in any field.",
      );
    }
    if (fieldText(input.data.resumeBullet)) {
      if (containsFrameworkOrPartLabel(input.data.resumeBullet ?? "")) {
        issues.push(
          "Do not name CAR, STAR, or label parts in the resume bullet.",
        );
      }
    }
    if (fieldText(input.data.strengtheningNote)) {
      if (containsFrameworkOrPartLabel(input.data.strengtheningNote ?? "")) {
        issues.push(
          "Do not name CAR, STAR, or label parts in the strengthening note.",
        );
      }
    }
    return issues;
  }

  if (!isConsultationPolishPartsResult(input.data)) {
    issues.push(
      'Return answerFramework "CAR" or "STAR" with each required part as its own field (not a single interviewAnswer).',
    );
    return issues;
  }

  const parts = input.data;
  if (parts.answerFramework === "CAR") {
    if (!fieldText(parts.challenge)) issues.push(blankPartFeedback("challenge"));
    if (!fieldText(parts.action)) issues.push(blankPartFeedback("action"));
    if (!fieldText(parts.result)) issues.push(blankPartFeedback("result"));
  } else {
    if (!fieldText(parts.situation)) issues.push(blankPartFeedback("situation"));
    if (!fieldText(parts.task)) issues.push(blankPartFeedback("task"));
    if (!fieldText(parts.action)) issues.push(blankPartFeedback("action"));
    if (!fieldText(parts.result)) issues.push(blankPartFeedback("result"));
  }

  if (fieldText(parts.result) && !resultStatesOutcome(parts.result ?? "")) {
    issues.push(
      "The result must state what changed or what happened because of the person's action. A number is welcome when the facts include one but is never required.",
    );
  }

  const fieldsToScan = partsInFrameworkOrder(parts);
  if (fieldText(parts.resumeBullet)) fieldsToScan.push(parts.resumeBullet ?? "");
  if (fieldText(parts.strengtheningNote)) {
    fieldsToScan.push(parts.strengtheningNote ?? "");
  }
  for (const field of fieldsToScan) {
    if (containsFrameworkOrPartLabel(field)) {
      issues.push(
        "Do not name CAR, STAR, or label parts (Challenge:, Situation:, Task:, Action:, Result:) in any field.",
      );
      break;
    }
  }

  if (issues.length === 0) {
    const composed = composeInterviewAnswerFromParts(
      partsInFrameworkOrder(parts),
    );
    const wordCount = composed.split(/\s+/).filter(Boolean).length;
    if (wordCount > input.maxWords) {
      issues.push(
        `The composed interview answer exceeded ${input.maxWords} words. Keep only as long as the facts support.`,
      );
    }
  }

  return issues;
}

/** Compose + normalize a validated polish result for storage and display. */
export function normalizePolishAnswer(input: {
  data: ConsultationPolishResult;
  whyThisCompany: boolean;
  confirmedGap: boolean;
}): NormalizedPolishAnswer {
  const exception = input.whyThisCompany || input.confirmedGap;
  if (exception || !isConsultationPolishPartsResult(input.data)) {
    return {
      interviewAnswer: fieldText(input.data.interviewAnswer),
      resumeBullet:
        input.confirmedGap || input.whyThisCompany
          ? null
          : input.data.resumeBullet,
      strengtheningNote: input.data.strengtheningNote,
      answerPartsGrounding: null,
    };
  }

  const composed = composeInterviewAnswerFromParts(
    partsInFrameworkOrder(input.data),
  );
  return {
    interviewAnswer: composed,
    resumeBullet:
      input.confirmedGap || input.whyThisCompany
        ? null
        : input.data.resumeBullet,
    strengtheningNote: input.data.strengtheningNote,
    answerPartsGrounding: answerPartsGroundingFromPolish(input.data),
  };
}
