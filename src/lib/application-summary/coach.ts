import type {
  ApplicationSummaryGuidance,
  CheatSheetCoachItem,
} from "@/lib/application-summary/contract";
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

function guidanceText(value: unknown): string | null {
  const row = asRecord(value);
  if (!row || typeof row.text !== "string") return null;
  const text = row.text.trim();
  return text || null;
}

export type PersonSectionRecruiterView = {
  sixtySecondSummary: string | null;
  whyThisCompany: string | null;
  whyThisRole: string | null;
  logistics: string | null;
  compensationReadiness: string | null;
  flagAnswers: CheatSheetCoachItem[];
};

export type PersonSectionHiringManagerView = {
  scorecardOutcomes: Array<{ outcome: string; storyId?: string; note?: string }>;
  firstNinetyDays: string | null;
  drillDowns: CheatSheetCoachItem[];
  gaps: CheatSheetCoachItem[];
};

/** Legacy recruiter / hiring-manager coach blocks still stored on some sections. */
export function personSectionRoleCoachViews(section: {
  recruiter?: unknown;
  hiringManager?: unknown;
}): {
  recruiter: PersonSectionRecruiterView | null;
  hiringManager: PersonSectionHiringManagerView | null;
} {
  const recruiterRow = asRecord(section.recruiter);
  const hiringManagerRow = asRecord(section.hiringManager);
  const recruiter = recruiterRow
    ? {
        sixtySecondSummary: guidanceText(recruiterRow.sixtySecondSummary),
        whyThisCompany: guidanceText(recruiterRow.whyThisCompany),
        whyThisRole: guidanceText(recruiterRow.whyThisRole),
        logistics: guidanceText(recruiterRow.logistics),
        compensationReadiness: guidanceText(recruiterRow.compensationReadiness),
        flagAnswers: asCoachItems(recruiterRow.flagAnswers),
      }
    : null;
  const hiringManager = hiringManagerRow
    ? {
        scorecardOutcomes: Array.isArray(hiringManagerRow.scorecardOutcomes)
          ? hiringManagerRow.scorecardOutcomes.flatMap((entry) => {
              const row = asRecord(entry);
              if (!row || typeof row.outcome !== "string") return [];
              return [
                {
                  outcome: row.outcome,
                  storyId: typeof row.storyId === "string" ? row.storyId : undefined,
                  note: typeof row.note === "string" ? row.note : undefined,
                },
              ];
            })
          : [],
        firstNinetyDays: guidanceText(hiringManagerRow.firstNinetyDays),
        drillDowns: asCoachItems(hiringManagerRow.drillDowns),
        gaps: asCoachItems(hiringManagerRow.gaps),
      }
    : null;
  return {
    recruiter:
      recruiter &&
      (recruiter.flagAnswers.length > 0 ||
        recruiter.sixtySecondSummary ||
        recruiter.whyThisCompany ||
        recruiter.whyThisRole ||
        recruiter.logistics ||
        recruiter.compensationReadiness)
        ? recruiter
        : null,
    hiringManager:
      hiringManager &&
      (hiringManager.drillDowns.length > 0 ||
        hiringManager.gaps.length > 0 ||
        hiringManager.scorecardOutcomes.length > 0 ||
        hiringManager.firstNinetyDays)
        ? hiringManager
        : null,
  };
}

/** Coach item ids rendered in the person profile (likely + flagAnswers + drill + gap). */
export function personProfileCoachItemIds(section: {
  likelyQuestions?: Array<{ id?: string }>;
  recruiter?: unknown;
  hiringManager?: unknown;
}): string[] {
  const { recruiter, hiringManager } = personSectionRoleCoachViews(section);
  return [
    ...(section.likelyQuestions ?? []),
    ...(recruiter?.flagAnswers ?? []),
    ...(hiringManager?.drillDowns ?? []),
    ...(hiringManager?.gaps ?? []),
  ]
    .map((item) => item.id?.trim() ?? "")
    .filter(Boolean);
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

