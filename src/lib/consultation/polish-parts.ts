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

const UNINTRODUCED_REFERENCE =
  /\b(?:the|that|this)\s+(?:transition|change|shift|move|acquisition|merger|reorganization|rotation|handoff|handover)\b/i;

/**
 * Situation and challenge are both kept. When the situation only refers back
 * ("the transition") and the challenge names what happened, the challenge
 * comes first so the stored answer introduces that thing.
 */
export function narrativeAnswerParts(input: {
  situation?: string | null;
  challenge?: string | null;
  task?: string | null;
  action?: string | null;
  result?: string | null;
}): string[] {
  const situation = input.situation ?? "";
  const challenge = input.challenge ?? "";
  const openings =
    situation.trim() &&
    challenge.trim() &&
    UNINTRODUCED_REFERENCE.test(situation) &&
    !UNINTRODUCED_REFERENCE.test(challenge)
      ? [challenge, situation]
      : [situation, challenge];
  return [...openings, input.task ?? "", input.action ?? "", input.result ?? ""];
}

/**
 * Every filled slot, including an opening stored on the other framework's
 * field. CAR assembly used to drop situation, and STAR assembly used to drop
 * challenge, so a later sentence could refer to a transition the draft never
 * introduced.
 */
export function partsInFrameworkOrder(
  result: ConsultationPolishResult & { answerFramework: AnswerFramework },
): string[] {
  return narrativeAnswerParts(result);
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

/**
 * Detect framework names or part labels leaked into polished fields.
 *
 * Rejects only:
 * (a) part labels used as labels/headings — Challenge|Situation|Task|Action|Result
 *     followed by a colon, or alone as a line heading;
 * (b) explicit method references — "(the) STAR|CAR method|format|framework|technique"
 *     (case-insensitive).
 *
 * Does not reject bare star/stars/car/cars (any case), or ordinary sentence uses of
 * challenge, situation, task, action, or result.
 */
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
  if (/(?:^|\n)\s*(?:Challenge|Situation|Task|Action|Result)\s*$/im.test(value)) {
    return true;
  }
  if (
    /\b(?:the\s+)?(?:STAR|CAR)\s+(?:method|format|framework|technique)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Canonical reader for ConsultationStatement.groundingJson (Batch D3 parts).
 * Accepts the additive parts object, or legacy `[]` / unknown shapes (returns null).
 */
export function parseAnswerPartsGrounding(
  value: unknown,
): AnswerPartsGrounding | null {
  if (value == null) return null;
  if (Array.isArray(value)) return null;
  if (typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const framework = row.answerFramework;
  if (framework !== "CAR" && framework !== "STAR") return null;
  const action = typeof row.action === "string" ? row.action.trim() : "";
  const result = typeof row.result === "string" ? row.result.trim() : "";
  if (!action || !result) return null;
  if (framework === "CAR") {
    const challenge =
      typeof row.challenge === "string" ? row.challenge.trim() : "";
    if (!challenge) return null;
    return { answerFramework: "CAR", challenge, action, result };
  }
  const situation =
    typeof row.situation === "string" ? row.situation.trim() : "";
  const task = typeof row.task === "string" ? row.task.trim() : "";
  if (!situation || !task) return null;
  return { answerFramework: "STAR", situation, task, action, result };
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

/**
 * Best-available draft when D3 parts / lenient result validation fails after
 * bounded regen (e.g. missing result). Uses only non-empty parts without
 * inventing facts, framework names, or part labels.
 */
export function bestEffortNormalizedPolish(input: {
  data: ConsultationPolishResult;
  whyThisCompany: boolean;
  confirmedGap: boolean;
}): NormalizedPolishAnswer | null {
  const exception = input.whyThisCompany || input.confirmedGap;
  if (exception) {
    const interviewAnswer = fieldText(input.data.interviewAnswer);
    if (!interviewAnswer || containsFrameworkOrPartLabel(interviewAnswer)) {
      return null;
    }
    const resumeBullet = fieldText(input.data.resumeBullet);
    if (resumeBullet && containsFrameworkOrPartLabel(resumeBullet)) {
      return null;
    }
    return {
      interviewAnswer,
      resumeBullet: input.confirmedGap || input.whyThisCompany ? null : input.data.resumeBullet,
      strengtheningNote: input.data.strengtheningNote,
      answerPartsGrounding: null,
    };
  }

  if (isConsultationPolishPartsResult(input.data)) {
    const parts = partsInFrameworkOrder(input.data).filter(
      (part) => part.trim() && !containsFrameworkOrPartLabel(part),
    );
    if (parts.length === 0) return null;
    const interviewAnswer = composeInterviewAnswerFromParts(parts);
    if (!interviewAnswer.trim()) return null;
    const resumeBullet = fieldText(input.data.resumeBullet);
    if (resumeBullet && containsFrameworkOrPartLabel(resumeBullet)) {
      return {
        interviewAnswer,
        resumeBullet: null,
        strengtheningNote: input.data.strengtheningNote,
        answerPartsGrounding: null,
      };
    }
    return {
      interviewAnswer,
      resumeBullet: resumeBullet || null,
      strengtheningNote: input.data.strengtheningNote,
      answerPartsGrounding: null,
    };
  }

  const interviewAnswer = fieldText(input.data.interviewAnswer);
  if (!interviewAnswer || containsFrameworkOrPartLabel(interviewAnswer)) {
    return null;
  }
  const resumeBullet = fieldText(input.data.resumeBullet);
  if (resumeBullet && containsFrameworkOrPartLabel(resumeBullet)) {
    return {
      interviewAnswer,
      resumeBullet: null,
      strengtheningNote: input.data.strengtheningNote,
      answerPartsGrounding: null,
    };
  }
  return {
    interviewAnswer,
    resumeBullet: resumeBullet || null,
    strengtheningNote: input.data.strengtheningNote,
    answerPartsGrounding: null,
  };
}
