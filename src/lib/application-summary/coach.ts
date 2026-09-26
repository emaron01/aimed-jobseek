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

export function collectCoachItems(
  guidance: ApplicationSummaryGuidance,
): CheatSheetCoachItem[] {
  return [
    ...(guidance.overview?.gapsToPrepare ?? []),
    ...guidance.people.flatMap((person) => [
      ...person.likelyQuestions,
      ...(person.recruiter?.flagAnswers ?? []),
      ...(person.hiringManager?.drillDowns ?? []),
      ...(person.hiringManager?.gaps ?? []),
    ]),
  ];
}

export function assignCoachItemIds(
  guidance: ApplicationSummaryGuidance,
): ApplicationSummaryGuidance {
  const nextId = (prefix: string, index: number, current?: string) =>
    current?.trim() || `${prefix}:${index + 1}`;
  return {
    ...guidance,
    overview: guidance.overview
      ? {
          ...guidance.overview,
          gapsToPrepare: guidance.overview.gapsToPrepare.map((item, index) => ({
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
      recruiter: person.recruiter
        ? {
            ...person.recruiter,
            flagAnswers: person.recruiter.flagAnswers.map((item, index) => ({
              ...item,
              id: nextId(`${person.sectionKey}:flag`, index, item.id),
            })),
          }
        : null,
      hiringManager: person.hiringManager
        ? {
            ...person.hiringManager,
            drillDowns: person.hiringManager.drillDowns.map((item, index) => ({
              ...item,
              id: nextId(`${person.sectionKey}:drill`, index, item.id),
            })),
            gaps: person.hiringManager.gaps.map((item, index) => ({
              ...item,
              id: nextId(`${person.sectionKey}:gap`, index, item.id),
            })),
          }
        : null,
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
          gapsToPrepare: mapItems(guidance.overview.gapsToPrepare),
        }
      : undefined,
    people: guidance.people.map((person) => ({
      ...person,
      likelyQuestions: mapItems(person.likelyQuestions),
      recruiter: person.recruiter
        ? {
            ...person.recruiter,
            flagAnswers: mapItems(person.recruiter.flagAnswers),
          }
        : null,
      hiringManager: person.hiringManager
        ? {
            ...person.hiringManager,
            drillDowns: mapItems(person.hiringManager.drillDowns),
            gaps: mapItems(person.hiringManager.gaps),
          }
        : null,
    })),
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
