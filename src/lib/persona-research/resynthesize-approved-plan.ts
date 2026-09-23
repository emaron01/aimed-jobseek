import {
  asManualFieldList,
  asTitleList,
  TARGET_TITLES_FIELD,
} from "@/lib/persona/manual-target-titles";
import type { PersonaCriterionFormRow } from "@/lib/persona-research/project-signals";
import { vocab } from "@/lib/product-config";

export type PersonaResynthesisTextSnapshot = {
  definition: string;
  responsibilities: string;
  painPoints: string;
  desiredOutcomes: string;
  messagingNotes: string;
};

export type PersonaResynthesisApplyPlanItem = {
  label: string;
  detail?: string;
};

export type PersonaResynthesisFieldDiff = {
  field: keyof PersonaResynthesisTextSnapshot;
  label: string;
  before: string;
  after: string;
};

export type PersonaResynthesisApplyPlan = {
  preserved: PersonaResynthesisApplyPlanItem[];
  replaced: PersonaResynthesisApplyPlanItem[];
  fieldDiffs: PersonaResynthesisFieldDiff[];
};

const COMPARE_FIELD_LABELS: Record<keyof PersonaResynthesisTextSnapshot, string> =
  {
    definition: "Role summary",
    responsibilities: "Primary responsibilities",
    painPoints: "Pain points",
    desiredOutcomes: "Desired outcomes",
    messagingNotes: "Messaging notes",
  };

function targetTitlesProtected(manuallyEditedFields: unknown): boolean {
  return asManualFieldList(manuallyEditedFields).includes(TARGET_TITLES_FIELD);
}

export function personaTextSnapshot(persona: {
  definition: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  desiredOutcomes: string | null;
  messagingNotes: string | null;
}): PersonaResynthesisTextSnapshot {
  return {
    definition: persona.definition ?? "",
    responsibilities: persona.responsibilities ?? "",
    painPoints: persona.painPoints ?? "",
    desiredOutcomes: persona.desiredOutcomes ?? "",
    messagingNotes: persona.messagingNotes ?? "",
  };
}

export function draftFieldsToTextSnapshot(fields: {
  definition: string | null;
  responsibilities: string[];
  painPoints: string[];
  desiredOutcomes: string[];
  messagingNotes: string | null;
}): PersonaResynthesisTextSnapshot {
  return {
    definition: fields.definition ?? "",
    responsibilities: fields.responsibilities.join("\n"),
    painPoints: fields.painPoints.join("\n"),
    desiredOutcomes: fields.desiredOutcomes.join("\n"),
    messagingNotes: fields.messagingNotes ?? "",
  };
}

export function buildPersonaResynthesisApplyPlan(input: {
  persona: {
    id: string;
    name: string;
    manuallyEditedFields: unknown;
    targetTitles: unknown;
  };
  existingCriteria: Array<{
    id: string;
    name: string;
    criterionType: string;
    manuallyEdited: boolean;
  }>;
  before: PersonaResynthesisTextSnapshot;
  after: PersonaResynthesisTextSnapshot;
  proposedCriteria: PersonaCriterionFormRow[];
}): PersonaResynthesisApplyPlan {
  const preserved: PersonaResynthesisApplyPlanItem[] = [
    {
      label: `${vocab.persona.Singular} id`,
      detail: `${input.persona.id} — ${vocab.campaign.plural}, scoring runs, and matched ${vocab.contact.plural} stay linked.`,
    },
    {
      label: `${vocab.persona.Singular} name`,
      detail: input.persona.name,
    },
  ];

  const manualCriteria = input.existingCriteria.filter((c) => c.manuallyEdited);
  for (const criterion of manualCriteria) {
    preserved.push({
      label: "Manually edited criterion",
      detail: criterion.name,
    });
  }

  if (targetTitlesProtected(input.persona.manuallyEditedFields)) {
    const titles = asTitleList(input.persona.targetTitles);
    preserved.push({
      label: "Rep-approved likely titles",
      detail: titles.length > 0 ? titles.join(", ") : "(none stored)",
    });
  }

  const replaced: PersonaResynthesisApplyPlanItem[] = [];
  const fieldDiffs: PersonaResynthesisFieldDiff[] = [];

  for (const field of Object.keys(
    COMPARE_FIELD_LABELS,
  ) as (keyof PersonaResynthesisTextSnapshot)[]) {
    const before = input.before[field];
    const after = input.after[field];
    if (before.trim() !== after.trim()) {
      fieldDiffs.push({
        field,
        label: COMPARE_FIELD_LABELS[field],
        before,
        after,
      });
      replaced.push({
        label: COMPARE_FIELD_LABELS[field],
      });
    }
  }

  const nonManualCount = input.existingCriteria.filter(
    (c) => !c.manuallyEdited,
  ).length;
  if (nonManualCount > 0 || input.proposedCriteria.length > 0) {
    replaced.push({
      label: "AI-generated criteria",
      detail:
        nonManualCount > 0
          ? `${nonManualCount} existing non-manual row(s) replaced with ${input.proposedCriteria.length} from the draft.`
          : `${input.proposedCriteria.length} row(s) from the draft.`,
    });
  }

  replaced.push({
    label: "Stored AI profile",
    detail: `profileJson and ${vocab.persona.singular} messaging structures`,
  });

  return { preserved, replaced, fieldDiffs };
}
