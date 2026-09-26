import type {
  ApplicationSummaryGuidance,
  CheatSheetCoachItem,
} from "@/lib/application-summary/contract";
import { applicationSummaryConfig, consultationConfig } from "@/lib/product-config";
import {
  seekerFirstName,
  seekerPrepInstructionViolations,
  seekerThirdPersonViolations,
} from "@/lib/consultation/voice";

export { seekerFirstName, seekerThirdPersonViolations };

export function prepareInstructionViolations(text: string): string[] {
  return seekerPrepInstructionViolations(text).map(
    () => "Replace prepare-style instructions with a sample answer or Harper's question.",
  );
}

export function coachItemIsComplete(item: CheatSheetCoachItem): boolean {
  const answer = item.sampleAnswer?.trim() ?? "";
  const question = item.harperQuestion?.trim() ?? "";
  return Boolean(answer) !== Boolean(question);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asCoachItems(value: unknown): CheatSheetCoachItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.prompt !== "string") return [];
    return [
      {
        id: typeof row.id === "string" ? row.id : undefined,
        prompt: row.prompt,
        sampleAnswer: typeof row.sampleAnswer === "string" ? row.sampleAnswer : null,
        harperQuestion: typeof row.harperQuestion === "string" ? row.harperQuestion : null,
        supports: Array.isArray(row.supports)
          ? row.supports.filter(
              (support): support is { sourceId: string; quote: string } =>
                Boolean(
                  support &&
                    typeof support === "object" &&
                    typeof (support as { sourceId?: unknown }).sourceId === "string" &&
                    typeof (support as { quote?: unknown }).quote === "string",
                ),
            )
          : [],
      },
    ];
  });
}

export function collectCoachItems(
  guidance: ApplicationSummaryGuidance,
): CheatSheetCoachItem[] {
  return [
    ...(guidance.overview?.gapsToPrepare ?? []),
    ...guidance.people.flatMap((person) => [
      ...person.likelyQuestions,
      ...asCoachItems(asRecord(person.recruiter)?.flagAnswers),
      ...asCoachItems(asRecord(person.hiringManager)?.drillDowns),
      ...asCoachItems(asRecord(person.hiringManager)?.gaps),
    ]),
  ];
}

export function assignCoachItemIds(
  guidance: ApplicationSummaryGuidance,
): ApplicationSummaryGuidance {
  const nextId = (prefix: string, index: number, current?: string) =>
    current?.trim() || `${prefix}:${index + 1}`;
  const mapKind = (value: unknown, prefix: string, field: string) => {
    const row = asRecord(value);
    if (!row) return value ?? null;
    const items = asCoachItems(row[field]).map((item, index) => ({
      ...item,
      id: nextId(`${prefix}:${field}`, index, item.id),
    }));
    return { ...row, [field]: items };
  };
  return {
    ...guidance,
    overview: guidance.overview
      ? {
          ...guidance.overview,
          gapsToPrepare: (guidance.overview.gapsToPrepare ?? []).map((item, index) => ({
            ...item,
            id: nextId("overview:gap", index, item.id),
          })),
        }
      : undefined,
    people: guidance.people.map((person) => ({
      ...person,
      likelyQuestions: person.likelyQuestions.map((item, index) => ({
        ...item,
        id: nextId(`${person.sectionKey}:likely`, index, item.id),
      })),
      recruiter: mapKind(person.recruiter, person.sectionKey, "flagAnswers"),
      hiringManager: (() => {
        const row = asRecord(person.hiringManager);
        if (!row) return person.hiringManager ?? null;
        return {
          ...row,
          drillDowns: asCoachItems(row.drillDowns).map((item, index) => ({
            ...item,
            id: nextId(`${person.sectionKey}:drill`, index, item.id),
          })),
          gaps: asCoachItems(row.gaps).map((item, index) => ({
            ...item,
            id: nextId(`${person.sectionKey}:gap`, index, item.id),
          })),
        };
      })(),
    })),
  };
}

export function findCoachItem(
  guidance: ApplicationSummaryGuidance,
  itemId: string,
): CheatSheetCoachItem | null {
  return collectCoachItems(guidance).find((item) => item.id === itemId) ?? null;
}

export function replaceCoachItem(
  guidance: ApplicationSummaryGuidance,
  itemId: string,
  next: CheatSheetCoachItem,
): ApplicationSummaryGuidance {
  const mapItems = (items: CheatSheetCoachItem[]) =>
    items.map((item) => (item.id === itemId ? next : item));
  return {
    ...guidance,
    overview: guidance.overview
      ? {
          ...guidance.overview,
          gapsToPrepare: mapItems(guidance.overview.gapsToPrepare ?? []),
        }
      : undefined,
    people: guidance.people.map((person) => {
      const hiringManager = asRecord(person.hiringManager);
      const recruiter = asRecord(person.recruiter);
      return {
        ...person,
        likelyQuestions: mapItems(person.likelyQuestions),
        recruiter: recruiter
          ? { ...recruiter, flagAnswers: mapItems(asCoachItems(recruiter.flagAnswers)) }
          : person.recruiter ?? null,
        hiringManager: hiringManager
          ? {
              ...hiringManager,
              drillDowns: mapItems(asCoachItems(hiringManager.drillDowns)),
              gaps: mapItems(asCoachItems(hiringManager.gaps)),
            }
          : person.hiringManager ?? null,
      };
    }),
  };
}

export function validateCoachItems(guidance: ApplicationSummaryGuidance): string[] {
  const errors: string[] = [];
  for (const item of collectCoachItems(guidance)) {
    if (!coachItemIsComplete(item)) {
      errors.push(
        `Each ${applicationSummaryConfig.sections.likelyQuestions.toLowerCase()} item needs a sample answer or ${consultationConfig.displayName}'s question.`,
      );
    }
    errors.push(...prepareInstructionViolations(item.prompt));
    if (item.sampleAnswer) {
      errors.push(...prepareInstructionViolations(item.sampleAnswer));
    }
    if (item.harperQuestion) {
      errors.push(...prepareInstructionViolations(item.harperQuestion));
      if (!item.harperQuestion.trim().endsWith("?")) {
        errors.push(`${consultationConfig.displayName}'s question must be written as a question.`);
      }
    }
  }
  return [...new Set(errors)];
}

export function validateSeekerVoice(input: {
  texts: string[];
  firstName: string | null;
}): string[] {
  const errors: string[] = [];
  for (const text of input.texts) {
    errors.push(...prepareInstructionViolations(text));
    errors.push(...seekerThirdPersonViolations({ text, firstName: input.firstName }));
  }
  return [...new Set(errors)];
}
