/**
 * Starter Target Employer draft from an approved Profile.
 * Interpretation runs without persisting; save happens only on approve.
 */

import {
  generateIcpInterpretation,
  persistGeneratedIcpCriteria,
} from "@/lib/interpretation/icp";
import { isInterpretationAiConfigured } from "@/lib/ai";
import {
  parseCandidateProfileSafe,
  factTexts,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { createIcp } from "@/lib/tenant/data";
import { vocab } from "@/lib/product-config";
import {
  parseIcpFormData,
  STARTER_DRAFT_KIND,
  type IcpActionResult,
  type IcpFormValues,
  type StarterCriterionRow,
  type StarterTargetEmployerDraft,
} from "@/lib/icp/save";
import type { InterpretedCriterionDraft } from "@/lib/criteria/types";
import { parseIcpInterpretedCriteria } from "@/lib/interpretation/schema";
import { resolveIcpEvidenceClass } from "@/lib/criteria/evidence-class";
import { applyEmployerCriterionStrength } from "@/lib/interpretation/criterion-strength";
import { resolveProposedIcpCriterionTier } from "@/lib/criteria/tier";
import { normalizeInOperatorValues } from "@/lib/criteria/multi-value";
import { statedEmployerCompensationFromProfile } from "@/lib/icp/stated-compensation";

export { STARTER_DRAFT_KIND };
export type { StarterCriterionRow, StarterTargetEmployerDraft };

function factLine(item: { text?: string | null } | null | undefined): string {
  return item?.text?.trim() ?? "";
}

export function buildStarterTargetEmployerDefinition(
  profile: CandidateProfile,
): string {
  const titles = factTexts(profile.direction.targetTitles);
  const functions = factTexts(profile.direction.functions);
  const goals = factTexts(profile.direction.careerGoals);
  const seniority = factLine(profile.direction.seniority);
  const workArrangement = factLine(
    profile.identity.workArrangementPreference,
  );
  const location = factLine(profile.identity.location);
  const relocation = factLine(profile.identity.relocationOpenness);
  const positioning = factLine(profile.positioning);

  const parts: string[] = [];
  if (titles.length > 0) {
    parts.push(`Target titles: ${titles.join(", ")}.`);
  }
  if (seniority) {
    parts.push(`Seniority: ${seniority}.`);
  }
  if (functions.length > 0) {
    parts.push(`Functions: ${functions.join(", ")}.`);
  }
  if (goals.length > 0) {
    parts.push(`Career goals: ${goals.join("; ")}.`);
  }
  if (workArrangement) {
    parts.push(`Work arrangement: ${workArrangement}.`);
  }
  if (location) {
    parts.push(`Location: ${location}.`);
  }
  if (relocation) {
    parts.push(`Relocation: ${relocation}.`);
  }
  if (positioning) {
    parts.push(`Direction: ${positioning}.`);
  }

  if (parts.length === 0) {
    throw new TenantError(
      `The approved ${vocab.product.singular} does not yet state direction or career goals to draft ${vocab.icp.aSingular} from. Write one from scratch, or add those details to the ${vocab.product.singular} first.`,
    );
  }

  return parts.join(" ");
}

export function starterTargetEmployerName(profile: CandidateProfile): string {
  const titles = factTexts(profile.direction.targetTitles);
  if (titles.length > 0) {
    return `${vocab.icp.Singular} for ${titles.slice(0, 2).join(", ")}`;
  }
  const functions = factTexts(profile.direction.functions);
  if (functions.length > 0) {
    return `${vocab.icp.Singular} for ${functions.slice(0, 2).join(", ")}`;
  }
  return `Starter ${vocab.icp.singular}`;
}

function draftToRow(draft: InterpretedCriterionDraft): StarterCriterionRow {
  return {
    name: draft.name,
    description: draft.description ?? null,
    criterionType: draft.criterionType,
    dataType: draft.dataType,
    operator: draft.operator,
    targetValue: draft.targetValue,
    minValue: draft.minValue,
    maxValue: draft.maxValue,
    allowedValues: draft.allowedValues,
    importance: draft.importance,
    isRequired: draft.isRequired,
    isDisqualifier: draft.isDisqualifier,
    researchGuidance: draft.researchGuidance ?? null,
    strengthAdjustment: draft.strengthAdjustment ?? null,
    evidenceClass: draft.evidenceClass ?? null,
    tier: draft.tier ?? null,
    isMandatory: false,
    sortOrder: draft.sortOrder,
  };
}

export function parseStarterCriteriaJson(
  raw: string,
  seekerText: string,
): InterpretedCriterionDraft[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new TenantError("Starter criteria could not be read. Draft again.");
  }
  const wrapped =
    parsed && typeof parsed === "object" && Array.isArray(parsed)
      ? {
          understoodSummary: "Starter draft",
          undetermined: [],
          criteria: parsed,
        }
      : parsed;
  const result = parseIcpInterpretedCriteria(wrapped);
  return result.criteria.map((c) => {
    const normalized = normalizeInOperatorValues({
      operator: c.operator,
      dataType: c.dataType,
      targetValue: c.targetValue,
      allowedValues: c.allowedValues,
    });
    const evidenceClass = resolveIcpEvidenceClass({
      proposed: c.evidenceClass,
      name: c.name,
      criterionType: c.criterionType,
      description: c.description,
    });
    const strength = applyEmployerCriterionStrength({
      seekerText,
      name: c.name,
      criterionType: c.criterionType,
      description: c.description,
      targetValue: normalized.targetValue,
      minValue: c.minValue,
      maxValue: c.maxValue,
      allowedValues: normalized.allowedValues,
      isRequired: c.isRequired,
      isDisqualifier: c.isDisqualifier,
      importance: c.importance,
    });
    return {
      ...c,
      targetValue: normalized.targetValue,
      allowedValues: normalized.allowedValues,
      isRequired: strength.isRequired,
      isDisqualifier: strength.isDisqualifier,
      importance: strength.importance,
      strengthAdjustment: strength.strengthAdjustment,
      evidenceClass,
      tier: resolveProposedIcpCriterionTier({
        proposedTier: c.tier,
        name: c.name,
        criterionType: c.criterionType,
        description: c.description,
        evidenceClass,
        isDisqualifier: strength.isDisqualifier,
      }),
      isMandatory: false,
      source: "AI_INTERPRETED" as const,
    };
  });
}

export async function previewStarterTargetEmployer(input: {
  organizationId: string;
  productId: string;
}): Promise<StarterTargetEmployerDraft> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(
      `${vocab.product.Singular} not found in the active organization.`,
    );
  }
  if (product.approvalStatus !== "APPROVED") {
    throw new TenantError(
      `Approve the ${vocab.product.singular} before drafting ${vocab.icp.aSingular} from it.`,
    );
  }

  const parsed = parseCandidateProfileSafe(product.profileJson);
  if (!parsed.ok) {
    throw new TenantError(
      `The approved ${vocab.product.singular} has no structured direction to draft from. Write ${vocab.icp.aSingular} from scratch.`,
    );
  }
  const profile = parsed.profile;

  const definition = buildStarterTargetEmployerDefinition(profile);
  const name = starterTargetEmployerName(profile);

  const compensation = statedEmployerCompensationFromProfile(profile);

  if (!isInterpretationAiConfigured()) {
    return {
      kind: STARTER_DRAFT_KIND,
      name,
      definition,
      additionalContext: "",
      criteria: [],
      interpretationSummary: null,
      interpretationUndetermined: null,
      compensation,
    };
  }

  const generated = await generateIcpInterpretation({
    productName: product.name,
    productDescription: product.description,
    definition,
    additionalContext: null,
  });

  return {
    kind: STARTER_DRAFT_KIND,
    name,
    definition,
    additionalContext: "",
    criteria: generated.drafts.map(draftToRow),
    interpretationSummary: generated.understoodSummary,
    interpretationUndetermined:
      generated.undetermined.join("\n") || null,
    compensation,
  };
}

export async function approveStarterTargetEmployer(input: {
  organizationId: string;
  values: IcpFormValues;
  criteriaJson: string;
  interpretationSummary: string;
  interpretationUndetermined: string;
}): Promise<{ icpId: string }> {
  const parsed = parseIcpFormData(
    (() => {
      const fd = new FormData();
      for (const [key, value] of Object.entries(input.values)) {
        fd.set(key, value);
      }
      return fd;
    })(),
  );
  if (Object.keys(parsed.fieldErrors).length > 0) {
    const firstField = Object.keys(parsed.fieldErrors)[0] as
      | keyof typeof parsed.fieldErrors
      | undefined;
    throw new TenantError(
      (firstField ? parsed.fieldErrors[firstField] : undefined) ??
        "Please fix the highlighted fields.",
    );
  }

  const created = await createIcp({
    ...parsed.fields,
    productId: parsed.productId,
  });

  const drafts = parseStarterCriteriaJson(
    input.criteriaJson,
    [parsed.fields.definition ?? "", parsed.fields.additionalContext ?? ""]
      .map((part) => part.trim())
      .filter(Boolean)
      .join("\n"),
  );
  if (drafts.length > 0) {
    await persistGeneratedIcpCriteria({
      organizationId: input.organizationId,
      icpId: created.id,
      drafts,
      understoodSummary: input.interpretationSummary,
      undetermined: input.interpretationUndetermined
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  }

  return { icpId: created.id };
}

export function starterDraftToActionResult(
  draft: StarterTargetEmployerDraft,
): IcpActionResult {
  return {
    ok: true,
    message: `Starter ${vocab.icp.singular} drafted from your ${vocab.product.singular}. Review and approve to save.`,
    starterDraft: draft,
    values: {
      id: "",
      productId: "",
      name: draft.name,
      description: "",
      definition: draft.definition,
      additionalContext: draft.additionalContext,
      targetIndustries: "",
      minEmployees: "",
      maxEmployees: "",
      minRevenue: "",
      maxRevenue: "",
      targetGeographies: "",
      requiredTechnologies: "",
      positiveSignals: "",
      negativeSignals: "",
      notes: "",
      ...draft.compensation,
    },
  };
}
