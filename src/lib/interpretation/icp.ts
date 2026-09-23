import "server-only";

import type { IcpCriterion, Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import {
  getInterpretationAiConfig,
  getInterpretationAiProvider,
  getAiConfigPublicSummary,
  isInterpretationAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  buildLegacyIcpCriteria,
  ensureIcpLegacyCriteriaBackfilled,
} from "@/lib/criteria/legacy-backfill";
import {
  checkTargetedSearchCap,
  normalizeEvidenceClass,
  repairedEvidenceClassIfMisclassed,
  resolveIcpEvidenceClass,
} from "@/lib/criteria/evidence-class";
import {
  coerceIsMandatory,
  normalizeIcpCriterionTier,
  resolveProposedIcpCriterionTier,
} from "@/lib/criteria/tier";
import { normalizeInOperatorValues } from "@/lib/criteria/multi-value";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  ICP_INTERPRETATION_PROMPT_VERSION,
  type CriterionSnapshot,
  type InterpretedCriterionDraft,
} from "@/lib/criteria/types";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { getResearchPolicy } from "@/lib/usage/policy";
import { parseIcpInterpretedCriteria } from "@/lib/interpretation/schema";
import { ICP_INTERPRETATION_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { applyEmployerCriterionStrength } from "@/lib/interpretation/criterion-strength";
import { vocab } from "@/lib/product-config";
import type { AiMessage } from "@/lib/ai/types";

function criterionRowToSnapshot(row: IcpCriterion): CriterionSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    criterionType: row.criterionType,
    dataType: row.dataType,
    operator: row.operator,
    targetValue: row.targetValue,
    minValue: row.minValue,
    maxValue: row.maxValue,
    allowedValues: row.allowedValues,
    importance: row.importance,
    isRequired: row.isRequired,
    isDisqualifier: row.isDisqualifier,
    researchGuidance: row.researchGuidance,
    strengthAdjustment: row.strengthAdjustment,
    source: row.source,
    confidence: row.confidence,
    manuallyEdited: row.manuallyEdited,
    evidenceClass: row.evidenceClass,
    evidenceClassLocked: row.evidenceClassLocked,
    tier: row.tier,
    isMandatory: row.isMandatory,
    targetedSearchDecision: row.targetedSearchDecision,
    targetedSearchDecisionFingerprint: row.targetedSearchDecisionFingerprint,
    targetedSearchDecidedAt: row.targetedSearchDecidedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
  };
}

function buildIcpInterpretationMessages(input: {
  productName: string;
  productDescription: string | null;
  definition: string;
  additionalContext: string | null;
  existingCriteria: CriterionSnapshot[];
}): AiMessage[] {
  const system = `Prompt version: ${ICP_INTERPRETATION_PROMPT_VERSION}

${ICP_INTERPRETATION_SYSTEM_INSTRUCTIONS}`;

  const user = JSON.stringify({
    product: {
      name: input.productName,
      description: input.productDescription,
    },
    icpDefinition: input.definition,
    additionalContext: input.additionalContext,
    existingFirmographics: input.existingCriteria.map((c) => ({
      name: c.name,
      type: c.criterionType,
      operator: c.operator,
      evidenceClass: c.evidenceClass ?? null,
      tier: c.tier ?? null,
      isMandatory: false,
      manuallyEdited: c.manuallyEdited ?? false,
      evidenceClassLocked: c.evidenceClassLocked ?? false,
    })),
    responseSchema: {
      understoodSummary:
        "2-4 sentence plain-language read-back of what was understood",
      undetermined: ["specific named items that could not be determined"],
      criteria: [
        {
          name: "string",
          description: "string|null",
          criterionType: "string slug e.g. industry, employee_count",
          dataType: "TEXT|NUMBER|CURRENCY|BOOLEAN|ENUM|MULTI_SELECT|DATE",
          operator: "EQUALS|NOT_EQUALS|CONTAINS|IN|NOT_IN|GREATER_THAN|...",
          targetValue:
            "for IN/NOT_IN: array of discrete strings; otherwise any|null",
          minValue: "any|null",
          maxValue: "any|null",
          importance: "CRITICAL|HIGH|MEDIUM|LOW",
          isRequired: "boolean",
          isDisqualifier: "boolean",
          evidenceClass: "LIST_DATA|COMPANY_RESEARCH|TARGETED_SEARCH|SEMANTIC",
          tier: "PRIMARY|SECONDARY",
          researchGuidance: "string|null",
          sortOrder: "number",
        },
      ],
    },
  });

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function listIcpCriteria(
  organizationId: string,
  icpId: string,
): Promise<CriterionSnapshot[]> {
  await repairUnlockedIcpEvidenceClasses(organizationId, icpId);
  const rows = await prisma.icpCriterion.findMany({
    where: { organizationId, icpId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(criterionRowToSnapshot);
}

/**
 * Rewrite unlocked firmographics stored as TARGETED_SEARCH (Prisma default /
 * skipped resolver) to LIST_DATA or COMPANY_RESEARCH. Does not mark the row
 * as a manual edit — this is an app correction, not a user override.
 */
export async function repairUnlockedIcpEvidenceClasses(
  organizationId: string,
  icpId: string,
): Promise<number> {
  const rows = await prisma.icpCriterion.findMany({
    where: { organizationId, icpId, evidenceClassLocked: false },
    select: {
      id: true,
      name: true,
      criterionType: true,
      description: true,
      evidenceClass: true,
    },
  });
  const updates = rows.flatMap((row) => {
    const next = repairedEvidenceClassIfMisclassed(row);
    return next ? [{ id: row.id, evidenceClass: next }] : [];
  });
  await Promise.all(
    updates.map((update) =>
      prisma.icpCriterion.update({
        where: { id: update.id },
        data: { evidenceClass: update.evidenceClass },
      }),
    ),
  );
  return updates.length;
}

export async function updateIcpCriterionManual(input: {
  organizationId: string;
  icpId: string;
  criterionId: string;
  data: Partial<
    Pick<
      IcpCriterion,
      | "name"
      | "description"
      | "criterionType"
      | "dataType"
      | "operator"
      | "targetValue"
      | "minValue"
      | "maxValue"
      | "allowedValues"
      | "importance"
      | "isRequired"
      | "isDisqualifier"
      | "researchGuidance"
      | "sortOrder"
      | "evidenceClass"
      | "evidenceClassLocked"
      | "tier"
      | "isMandatory"
      | "targetedSearchDecision"
      | "targetedSearchDecisionFingerprint"
      | "targetedSearchDecidedAt"
    >
  >;
}): Promise<CriterionSnapshot> {
  const existing = await prisma.icpCriterion.findFirst({
    where: {
      id: input.criterionId,
      organizationId: input.organizationId,
      icpId: input.icpId,
    },
  });
  if (!existing) {
    throw new TenantError(
      "ICP criterion not found in the active organization.",
    );
  }

  const nextEvidenceClass =
    input.data.evidenceClass !== undefined
      ? normalizeEvidenceClass(input.data.evidenceClass)
      : existing.evidenceClass;

  const nextTier =
    input.data.tier !== undefined
      ? (normalizeIcpCriterionTier(input.data.tier) ??
        resolveProposedIcpCriterionTier({
          name: input.data.name ?? existing.name,
          criterionType: input.data.criterionType ?? existing.criterionType,
          description:
            input.data.description !== undefined
              ? input.data.description
              : existing.description,
          evidenceClass: nextEvidenceClass,
          isDisqualifier: input.data.isDisqualifier ?? existing.isDisqualifier,
        }))
      : existing.tier;
  const nextMandatory = coerceIsMandatory(
    nextTier,
    input.data.isMandatory !== undefined
      ? input.data.isMandatory
      : existing.isMandatory,
  );

  const siblings = await prisma.icpCriterion.findMany({
    where: { organizationId: input.organizationId, icpId: input.icpId },
    select: { id: true, name: true, evidenceClass: true, tier: true },
  });
  const projected = siblings.map((s) => ({
    name: s.id === existing.id ? (input.data.name ?? s.name) : s.name,
    evidenceClass:
      s.id === existing.id ? nextEvidenceClass : s.evidenceClass,
    tier: s.id === existing.id ? nextTier : s.tier,
  }));
  const policy = await getResearchPolicy(input.organizationId);
  const cap = checkTargetedSearchCap({
    criteria: projected,
    maxAllowed: policy.maxTargetedSearchCriteriaPerIcp,
  });
  if (!cap.ok) throw new TenantError(cap.message);

  const updated = await prisma.icpCriterion.update({
    where: { id: existing.id },
    data: {
      name: input.data.name,
      description: input.data.description,
      criterionType: input.data.criterionType,
      dataType: input.data.dataType,
      operator: input.data.operator,
      targetValue:
        input.data.targetValue === undefined
          ? undefined
          : input.data.targetValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.targetValue as Prisma.InputJsonValue),
      minValue:
        input.data.minValue === undefined
          ? undefined
          : input.data.minValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.minValue as Prisma.InputJsonValue),
      maxValue:
        input.data.maxValue === undefined
          ? undefined
          : input.data.maxValue === null
            ? PrismaRuntime.JsonNull
            : (input.data.maxValue as Prisma.InputJsonValue),
      allowedValues:
        input.data.allowedValues === undefined
          ? undefined
          : input.data.allowedValues === null
            ? PrismaRuntime.JsonNull
            : (input.data.allowedValues as Prisma.InputJsonValue),
      importance: input.data.importance,
      isRequired: input.data.isRequired,
      isDisqualifier: input.data.isDisqualifier,
      strengthAdjustment:
        input.data.isRequired !== undefined ||
        input.data.isDisqualifier !== undefined
          ? null
          : undefined,
      researchGuidance: input.data.researchGuidance,
      sortOrder: input.data.sortOrder,
      evidenceClass: input.data.evidenceClass
        ? normalizeEvidenceClass(input.data.evidenceClass)
        : undefined,
      evidenceClassLocked:
        input.data.evidenceClassLocked ??
        (input.data.evidenceClass !== undefined ? true : undefined),
      tier: input.data.tier !== undefined ? nextTier : undefined,
      isMandatory:
        input.data.tier !== undefined || input.data.isMandatory !== undefined
          ? nextMandatory
          : undefined,
      targetedSearchDecision: input.data.targetedSearchDecision,
      targetedSearchDecisionFingerprint:
        input.data.targetedSearchDecisionFingerprint,
      targetedSearchDecidedAt: input.data.targetedSearchDecidedAt,
      manuallyEdited: true,
      source: "MANUAL",
    },
  });
  return criterionRowToSnapshot(updated);
}

async function persistLegacyCriteria(
  organizationId: string,
  icpId: string,
): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  await ensureIcpLegacyCriteriaBackfilled(organizationId, icpId);
  const icp = await prisma.icp.findFirst({
    where: { id: icpId, organizationId },
  });
  if (!icp) {
    throw new TenantError("ICP not found in the active organization.");
  }

  const count = await prisma.icpCriterion.count({
    where: { organizationId, icpId },
  });
  if (count === 0) {
    const drafts = buildLegacyIcpCriteria(icp);
    if (drafts.length > 0) {
      await prisma.icpCriterion.createMany({
        data: drafts.map((d) => draftToCreateData(organizationId, icpId, d)),
      });
    }
  }

  const criteria = await listIcpCriteria(organizationId, icpId);
  return { criteria, version: icp.interpretationVersion };
}

function draftToCreateData(
  organizationId: string,
  icpId: string,
  d: InterpretedCriterionDraft,
): Prisma.IcpCriterionCreateManyInput {
  const normalized = normalizeInOperatorValues({
    operator: d.operator,
    dataType: d.dataType,
    targetValue: d.targetValue,
    allowedValues: d.allowedValues,
  });
  const evidenceClass = resolveIcpEvidenceClass({
    proposed: d.evidenceClass,
    name: d.name,
    criterionType: d.criterionType,
    description: d.description,
  });
  const tier = resolveProposedIcpCriterionTier({
    proposedTier: d.tier,
    name: d.name,
    criterionType: d.criterionType,
    description: d.description,
    evidenceClass,
    isDisqualifier: d.isDisqualifier,
  });
  return {
    organizationId,
    icpId,
    name: d.name,
    description: d.description ?? null,
    criterionType: d.criterionType,
    dataType: d.dataType,
    operator: d.operator,
    targetValue: normalized.targetValue as Prisma.InputJsonValue,
    minValue: d.minValue as Prisma.InputJsonValue,
    maxValue: d.maxValue as Prisma.InputJsonValue,
    allowedValues: normalized.allowedValues as Prisma.InputJsonValue,
    importance: d.importance,
    isRequired: d.isRequired,
    isDisqualifier: d.isDisqualifier,
    researchGuidance: d.researchGuidance ?? null,
    strengthAdjustment: d.strengthAdjustment ?? null,
    evidenceClass,
    evidenceClassLocked: d.evidenceClassLocked ?? false,
    tier,
    isMandatory: coerceIsMandatory(tier, false),
    source:
      (d.source as "AI_INTERPRETED" | "MANUAL" | "MIGRATED_FROM_LEGACY") ??
      "AI_INTERPRETED",
    sortOrder: d.sortOrder,
    manuallyEdited: false,
  };
}

function extractRawCriteria(rawText: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(rawText);
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { criteria?: unknown }).criteria)
    ) {
      return (parsed as { criteria: unknown[] }).criteria;
    }
  } catch {
    // rawText may include a wrapper; logging still records parsed classes.
  }
  return [];
}

function logIcpInterpretationEvidenceClasses(input: {
  icpId: string;
  rawText: string;
  parsed: {
    criteria: Array<{
      name: string;
      criterionType: string;
      description?: string | null;
      evidenceClass?: string | null;
    }>;
  };
}): void {
  const rawCriteria = extractRawCriteria(input.rawText);
  console.info(
    JSON.stringify({
      event: "icp_interpretation_evidence_class",
      icpId: input.icpId,
      rawTextPreview: input.rawText.slice(0, 4000),
      rawEvidenceClasses: rawCriteria.map((row) => {
        if (!row || typeof row !== "object") {
          return { raw: row };
        }
        const criterion = row as Record<string, unknown>;
        return {
          name: criterion.name ?? null,
          criterionType: criterion.criterionType ?? null,
          evidenceClass: criterion.evidenceClass ?? null,
          evidenceClassKeyPresent: Object.prototype.hasOwnProperty.call(
            criterion,
            "evidenceClass",
          ),
        };
      }),
      parsedEvidenceClasses: input.parsed.criteria.map((criterion) => ({
        name: criterion.name,
        criterionType: criterion.criterionType,
        evidenceClass: criterion.evidenceClass ?? null,
        resolved: resolveIcpEvidenceClass({
          proposed: criterion.evidenceClass,
          name: criterion.name,
          criterionType: criterion.criterionType,
          description: criterion.description,
        }),
      })),
    }),
  );
}

function applyLockedEvidenceClass(
  draft: InterpretedCriterionDraft,
  existing: CriterionSnapshot[],
): InterpretedCriterionDraft {
  const locked = existing.find(
    (e) =>
      e.evidenceClassLocked &&
      e.criterionType.trim().toLowerCase() ===
        draft.criterionType.trim().toLowerCase() &&
      e.name.trim().toLowerCase() === draft.name.trim().toLowerCase(),
  );
  if (!locked?.evidenceClass) return draft;
  return {
    ...draft,
    evidenceClass: locked.evidenceClass,
    evidenceClassLocked: true,
  };
}

export type GeneratedIcpInterpretation = {
  understoodSummary: string;
  undetermined: string[];
  drafts: InterpretedCriterionDraft[];
};

function mapParsedCriteriaToDrafts(
  parsed: ReturnType<typeof parseIcpInterpretedCriteria>,
  existingSnapshots: CriterionSnapshot[],
  seekerText: string,
): InterpretedCriterionDraft[] {
  const drafts = parsed.criteria.map((c) => {
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
    const draft: InterpretedCriterionDraft = {
      ...c,
      targetValue: normalized.targetValue,
      allowedValues: normalized.allowedValues,
      evidenceClass,
      isRequired: strength.isRequired,
      isDisqualifier: strength.isDisqualifier,
      importance: strength.importance,
      strengthAdjustment: strength.strengthAdjustment,
      tier: resolveProposedIcpCriterionTier({
        proposedTier: c.tier,
        name: c.name,
        criterionType: c.criterionType,
        description: c.description,
        evidenceClass,
        isDisqualifier: strength.isDisqualifier,
      }),
      isMandatory: false,
      source: "AI_INTERPRETED",
    };
    return applyLockedEvidenceClass(draft, existingSnapshots);
  });
  const adjustments = drafts.flatMap((draft) =>
    draft.strengthAdjustment
      ? [{ name: draft.name, strengthAdjustment: draft.strengthAdjustment }]
      : [],
  );
  if (adjustments.length > 0) {
    console.info(
      JSON.stringify({
        event: "icp_criterion_strength_adjustment",
        adjustments,
      }),
    );
  }
  return drafts;
}

/** Interpret a definition without writing Icp or IcpCriterion rows. */
export async function generateIcpInterpretation(input: {
  productName: string;
  productDescription: string | null;
  definition: string;
  additionalContext?: string | null;
  existingCriteria?: CriterionSnapshot[];
  logIcpId?: string;
}): Promise<GeneratedIcpInterpretation> {
  if (!isInterpretationAiConfigured()) {
    throw new TenantError(
      `AI interpretation is not configured. You can still write ${vocab.icp.aSingular} from scratch.`,
    );
  }

  const existingSnapshots = input.existingCriteria ?? [];
  const ai = getInterpretationAiProvider();
  const response = await ai.generateStructured({
    ...structuredOutputRequest("icpInterpretation"),
    messages: buildIcpInterpretationMessages({
      productName: input.productName,
      productDescription: input.productDescription,
      definition: input.definition,
      additionalContext: input.additionalContext ?? null,
      existingCriteria: existingSnapshots,
    }),
  });

  const parsed = parseIcpInterpretedCriteria(response.data);
  if (input.logIcpId) {
    logIcpInterpretationEvidenceClasses({
      icpId: input.logIcpId,
      rawText: response.rawText,
      parsed,
    });
  }

  return {
    understoodSummary: parsed.understoodSummary.trim(),
    undetermined: parsed.undetermined
      .map((item) => item.trim())
      .filter(Boolean),
    drafts: mapParsedCriteriaToDrafts(
      parsed,
      existingSnapshots,
      [input.definition, input.additionalContext ?? ""]
        .map((part) => part.trim())
        .filter(Boolean)
        .join("\n"),
    ),
  };
}

export async function persistGeneratedIcpCriteria(input: {
  organizationId: string;
  icpId: string;
  drafts: InterpretedCriterionDraft[];
  understoodSummary: string;
  undetermined: string[];
}): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  const icp = await prisma.icp.findFirst({
    where: { id: input.icpId, organizationId: input.organizationId },
  });
  if (!icp) {
    throw new TenantError(
      `${vocab.icp.singular} not found in the active organization.`,
    );
  }

  const policy = await getResearchPolicy(input.organizationId);
  const cap = checkTargetedSearchCap({
    criteria: input.drafts.map((d) => ({
      name: d.name,
      evidenceClass: normalizeEvidenceClass(d.evidenceClass),
      tier: d.tier,
    })),
    maxAllowed: policy.maxTargetedSearchCriteriaPerIcp,
  });
  if (!cap.ok) {
    throw new TenantError(cap.message);
  }

  const newVersion = icp.interpretationVersion + 1;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    if (input.drafts.length > 0) {
      await tx.icpCriterion.createMany({
        data: input.drafts.map((d) =>
          draftToCreateData(input.organizationId, input.icpId, d),
        ),
      });
    }

    await tx.icp.update({
      where: { id: input.icpId },
      data: {
        interpretationVersion: newVersion,
        interpretationPromptVersion: ICP_INTERPRETATION_PROMPT_VERSION,
        lastInterpretedAt: now,
        interpretationSummary: input.understoodSummary.trim() || null,
        interpretationUndetermined:
          input.undetermined
            .map((item) => item.trim())
            .filter(Boolean)
            .join("\n") || null,
      },
    });
  });

  const criteria = await listIcpCriteria(input.organizationId, input.icpId);
  return { criteria, version: newVersion };
}

export async function interpretIcpDefinition(input: {
  organizationId: string;
  icpId: string;
  userId?: string | null;
}): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  const icp = await prisma.icp.findFirst({
    where: { id: input.icpId, organizationId: input.organizationId },
    include: { product: true, criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!icp) {
    throw new TenantError("ICP not found in the active organization.");
  }

  const definition = icp.definition?.trim() || icp.description?.trim();
  if (!definition) {
    throw new TenantError(
      "ICP requires a definition or description before interpretation.",
    );
  }

  await repairUnlockedIcpEvidenceClasses(input.organizationId, input.icpId);
  const criteriaAfterRepair = await prisma.icpCriterion.findMany({
    where: { organizationId: input.organizationId, icpId: input.icpId },
    orderBy: { sortOrder: "asc" },
  });

  if (!isInterpretationAiConfigured()) {
    return persistLegacyCriteria(input.organizationId, input.icpId);
  }

  const existingSnapshots = criteriaAfterRepair.map(criterionRowToSnapshot);
  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;

  try {
    providerSummary = getAiConfigPublicSummary(getInterpretationAiConfig());

    const generated = await generateIcpInterpretation({
      productName: icp.product.name,
      productDescription: icp.product.description,
      definition,
      additionalContext: icp.additionalContext,
      existingCriteria: existingSnapshots,
      logIcpId: input.icpId,
    });
    const aiDrafts = generated.drafts;
    const parsed = {
      understoodSummary: generated.understoodSummary,
      undetermined: generated.undetermined,
    };

    const plan = planCriterionReinterpretation({
      existing: criteriaAfterRepair.map((c) => ({
        id: c.id,
        name: c.name,
        criterionType: c.criterionType,
        manuallyEdited: c.manuallyEdited,
      })),
      aiDrafts,
    });

    // Cap: projected set = kept manuals + new inserts (never silently drop).
    // SECONDARY TARGETED_SEARCH does not consume the cap; missing tier = PRIMARY.
    const keptManual = existingSnapshots.filter((e) => e.manuallyEdited);
    const projectedForCap = [
      ...keptManual.map((m) => ({
        name: m.name,
        evidenceClass: m.evidenceClassLocked
          ? normalizeEvidenceClass(m.evidenceClass)
          : resolveIcpEvidenceClass({
              proposed: m.evidenceClass,
              name: m.name,
              criterionType: m.criterionType,
              description: m.description,
            }),
        tier: m.tier,
      })),
      ...plan.insertDrafts.map((d) => ({
        name: d.name,
        evidenceClass: normalizeEvidenceClass(d.evidenceClass),
        tier: d.tier,
      })),
    ];
    const policy = await getResearchPolicy(input.organizationId);
    const cap = checkTargetedSearchCap({
      criteria: projectedForCap,
      maxAllowed: policy.maxTargetedSearchCriteriaPerIcp,
    });
    if (!cap.ok) {
      throw new TenantError(cap.message);
    }

    const newVersion = icp.interpretationVersion + 1;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      if (plan.replaceNonManual) {
        await tx.icpCriterion.deleteMany({
          where: {
            organizationId: input.organizationId,
            icpId: input.icpId,
            manuallyEdited: false,
          },
        });
      }

      if (plan.insertDrafts.length > 0) {
        await tx.icpCriterion.createMany({
          data: plan.insertDrafts.map((d) =>
            draftToCreateData(input.organizationId, input.icpId, d),
          ),
        });
      }

      await tx.icp.update({
        where: { id: input.icpId },
        data: {
          interpretationVersion: newVersion,
          interpretationPromptVersion: ICP_INTERPRETATION_PROMPT_VERSION,
          lastInterpretedAt: now,
          interpretationSummary: parsed.understoodSummary.trim(),
          interpretationUndetermined:
            parsed.undetermined
              .map((item) => item.trim())
              .filter(Boolean)
              .join("\n") || null,
        },
      });
    });

    const criteria = await listIcpCriteria(input.organizationId, input.icpId);

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "ICP_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: {
        icpId: input.icpId,
        criteriaCount: criteria.length,
        promptVersion: ICP_INTERPRETATION_PROMPT_VERSION,
        version: newVersion,
      },
    });

    return { criteria, version: newVersion };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "ICP_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        icpId: input.icpId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
