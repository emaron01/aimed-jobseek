/**
 * In-place re-synthesis for an approved Persona — same persona id, reviewable draft.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import type { InterpretedCriterionDraft } from "@/lib/criteria/types";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import {
  asManualFieldList,
  asTitleList,
  TARGET_TITLES_FIELD,
} from "@/lib/persona/manual-target-titles";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import {
  buildPersonaCriteriaForReview,
  collectUnmappedCriterionTypesFromDraft,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import { createCorrelationId } from "@/lib/product-research/url";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import { selectProductEvidenceForPersona } from "@/lib/persona-research/compact";
import { runProgressivePersonaWebSearch } from "@/lib/persona-research/progressive-search";
import { synthesizePersonaFromEvidence } from "@/lib/persona-research/synthesize";
import { getResearchPolicy } from "@/lib/usage/policy";
import { recordUsageEvent } from "@/lib/usage/events";
import { vocab } from "@/lib/product-config";

export const PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG = "approvedPersonaResynthesis";

export type {
  PersonaResynthesisApplyPlan,
  PersonaResynthesisApplyPlanItem,
  PersonaResynthesisFieldDiff,
  PersonaResynthesisTextSnapshot,
} from "@/lib/persona-research/resynthesize-approved-plan";
export {
  buildPersonaResynthesisApplyPlan,
  draftFieldsToTextSnapshot,
  personaTextSnapshot,
} from "@/lib/persona-research/resynthesize-approved-plan";

function excerptsFromBundle(raw: unknown): EvidenceExcerpt[] {
  if (Array.isArray(raw)) return raw as EvidenceExcerpt[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { excerpts?: unknown }).excerpts)
  ) {
    return (raw as { excerpts: EvidenceExcerpt[] }).excerpts;
  }
  return [];
}

export function personaToBuyerRole(persona: {
  name: string;
  suggestionKey: string | null;
  department: string | null;
  targetTitles: unknown;
  whyThisPersonaMatters: string | null;
}): SuggestedBuyerRole {
  return {
    suggestionKey:
      persona.suggestionKey ??
      `persona-${persona.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: persona.name,
    likelyTitles: asTitleList(persona.targetTitles),
    departmentFunction: persona.department,
    whyThisRoleMatters: persona.whyThisPersonaMatters,
    confidence: "MEDIUM",
    evidenceRefs: [],
  };
}

function targetTitlesProtected(manuallyEditedFields: unknown): boolean {
  return asManualFieldList(manuallyEditedFields).includes(TARGET_TITLES_FIELD);
}

function formRowToDraft(row: PersonaCriterionFormRow): InterpretedCriterionDraft {
  return {
    name: row.name,
    description: row.description ?? null,
    criterionType: row.criterionType,
    dataType: "TEXT",
    operator: "EXISTS",
    importance: row.importance ?? "MEDIUM",
    isRequired: row.isRequired ?? false,
    isDisqualifier: row.isDisqualifier ?? false,
    sortOrder: 0,
    source: "AI_INTERPRETED",
  };
}

export async function startApprovedPersonaResynthesis(input: {
  organizationId: string;
  productId: string;
  userId: string;
  personaId: string;
}): Promise<{
  personaSetupRunId: string;
  status: "NEEDS_REVIEW" | "FAILED";
  errorSafe?: string;
}> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      productId: input.productId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }
  if (persona.approvalStatus !== "APPROVED") {
    throw new TenantError(`Only approved ${vocab.persona.plural} can be rebuilt from ${vocab.product.singular} evidence.`);
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }
  if (product.approvalStatus !== "APPROVED") {
    throw new TenantError(`Approve the ${vocab.product.singular} before rebuilding ${vocab.persona.aSingular}.`);
  }

  const approvedRun = persona.approvedPersonaSetupRunId
    ? await prisma.personaSetupRun.findFirst({
        where: {
          id: persona.approvedPersonaSetupRunId,
          organizationId: input.organizationId,
        },
      })
    : null;

  const productEvidenceBundleId =
    approvedRun?.productEvidenceBundleId ??
    persona.approvedEvidenceBundleId ??
    product.approvedEvidenceBundleId ??
    (
      await prisma.productEvidenceBundle.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
        },
        orderBy: { version: "desc" },
      })
    )?.id;

  if (!productEvidenceBundleId) {
    throw new TenantError(
      `No ${vocab.product.singular} evidence bundle available. Run ${vocab.product.singular} research first.`,
    );
  }

  const productBundle = await prisma.productEvidenceBundle.findFirst({
    where: {
      id: productEvidenceBundleId,
      organizationId: input.organizationId,
    },
  });
  if (!productBundle) {
    throw new TenantError(`${vocab.product.Singular} evidence bundle not found.`);
  }

  const buyerRole = personaToBuyerRole(persona);
  const correlationId = createCorrelationId();

  let productEvidence: EvidenceExcerpt[] = [];
  let personaEvidence: Awaited<
    ReturnType<typeof runProgressivePersonaWebSearch>
  >["excerpts"] = [];

  type PersonaEvidenceExcerpt = (typeof personaEvidence)[number];

  if (approvedRun?.personaEvidenceBundleId) {
    const personaBundle = await prisma.personaEvidenceBundle.findFirst({
      where: {
        id: approvedRun.personaEvidenceBundleId,
        organizationId: input.organizationId,
      },
    });
    const raw = personaBundle?.normalizedEvidenceJson as {
      productEvidence?: EvidenceExcerpt[];
      personaEvidence?: PersonaEvidenceExcerpt[];
    } | null;
    productEvidence = raw?.productEvidence ?? [];
    personaEvidence = raw?.personaEvidence ?? [];
  }

  if (productEvidence.length === 0) {
    productEvidence = selectProductEvidenceForPersona({
      roleName: buyerRole.name,
      excerpts: excerptsFromBundle(productBundle.normalizedEvidenceJson),
    });
  }

  const run = await prisma.personaSetupRun.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      personaId: persona.id,
      productEvidenceBundleId,
      personaEvidenceBundleId: approvedRun?.personaEvidenceBundleId ?? null,
      correlationId,
      status: "SYNTHESIZING",
      selectedBuyerRoleJson: buyerRole as unknown as Prisma.InputJsonValue,
      suggestionKey: persona.suggestionKey,
      userContextJson: {
        [PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG]: true,
        nameOverride: persona.name,
        likelyTitles: asTitleList(persona.targetTitles),
        responsibilities: parsePersonaListField(persona.responsibilities),
      },
      synthesisPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
      createdByUserId: input.userId,
    },
  });

  const result = await synthesizePersonaFromEvidence({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    personaSetupRunId: run.id,
    correlationId,
    product,
    buyerRole,
    userContext: {
      nameOverride: persona.name,
      likelyTitles: asTitleList(persona.targetTitles),
      responsibilities: parsePersonaListField(persona.responsibilities),
      notes: null,
    },
    productEvidence,
    personaEvidence,
    excludePersonaIdFromPeers: persona.id,
  });

  return {
    personaSetupRunId: result.personaSetupRunId,
    status: result.status,
    errorSafe: result.errorSafe,
  };
}

export async function applyApprovedPersonaResynthesis(input: {
  organizationId: string;
  productId: string;
  userId: string;
  personaId: string;
  personaSetupRunId: string;
  fields: {
    definition: string | null;
    responsibilities: string[];
    painPoints: string[];
    desiredOutcomes: string[];
    messagingNotes: string | null;
    department: string | null;
    seniority: string | null;
  };
  criteria?: PersonaCriterionFormRow[];
}): Promise<void> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      productId: input.productId,
      archivedAt: null,
    },
    include: { criteria: true },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }

  const run = await prisma.personaSetupRun.findFirst({
    where: {
      id: input.personaSetupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
      personaId: input.personaId,
    },
  });
  if (!run?.personaDraftJson) {
    throw new TenantError(`${vocab.persona.Singular} rebuild draft not found.`);
  }
  if (run.status !== "NEEDS_REVIEW") {
    throw new TenantError("This rebuild draft is no longer available for approval.");
  }

  const userContext = run.userContextJson as Record<string, unknown> | null;
  if (!userContext?.[PERSONA_RESYNTHESIS_USER_CONTEXT_FLAG]) {
    throw new TenantError(`This setup run is not an in-place ${vocab.persona.singular} rebuild.`);
  }

  const draft = run.personaDraftJson as PersonaAiDraft;
  const protectTitles = targetTitlesProtected(persona.manuallyEditedFields);

  const policy = await getResearchPolicy(input.organizationId);
  const built = buildPersonaCriteriaForReview(draft, {
    maxCriteria: policy.maxProjectedPersonaCriteria,
  });
  const unmappedCriterionTypes = collectUnmappedCriterionTypesFromDraft(draft);
  const criteriaRows =
    input.criteria && input.criteria.length > 0
      ? input.criteria
      : built.criteria;

  const plan = planCriterionReinterpretation({
    existing: persona.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      criterionType: c.criterionType,
      manuallyEdited: c.manuallyEdited,
    })),
    aiDrafts: criteriaRows.map(formRowToDraft),
  });

  await prisma.$transaction(async (tx) => {
    if (plan.replaceNonManual) {
      await tx.personaCriterion.deleteMany({
        where: {
          organizationId: input.organizationId,
          personaId: input.personaId,
          manuallyEdited: false,
        },
      });
    }

    for (const [i, row] of plan.insertDrafts.entries()) {
      const name = row.name.trim();
      if (!name) continue;
      const sourceRow = criteriaRows.find(
        (r) =>
          r.name.trim().toLowerCase() === name.toLowerCase() &&
          r.criterionType.trim().toLowerCase() ===
            row.criterionType.trim().toLowerCase(),
      );
      await tx.personaCriterion.create({
        data: {
          organizationId: input.organizationId,
          personaId: input.personaId,
          name,
          description: row.description ?? null,
          criterionType: row.criterionType.trim() || "responsibility",
          dataType: "TEXT",
          operator: "EXISTS",
          importance: row.importance ?? "MEDIUM",
          isRequired: row.isRequired ?? false,
          isDisqualifier: row.isDisqualifier ?? false,
          exclusionTestability: row.isDisqualifier
            ? (sourceRow?.exclusionTestability ?? "EVIDENCE_TESTABLE")
            : null,
          researchGuidance: sourceRow?.researchGuidance ?? null,
          source: "AI_INTERPRETED",
          sortOrder: persona.criteria.filter((c) => c.manuallyEdited).length + i,
          manuallyEdited: false,
        },
      });
    }

    await tx.persona.update({
      where: { id: input.personaId },
      data: {
        definition:
          input.fields.definition?.trim() || draft.roleSummary || null,
        department: input.fields.department || draft.departmentFunction,
        seniority: input.fields.seniority || draft.seniority,
        responsibilities:
          input.fields.responsibilities.join("\n") ||
          draft.primaryResponsibilities.join("\n") ||
          null,
        painPoints:
          input.fields.painPoints.join("\n") ||
          draft.painPoints.join("\n") ||
          null,
        desiredOutcomes:
          input.fields.desiredOutcomes.join("\n") ||
          draft.desiredOutcomesFromSolution.join("\n") ||
          null,
        messagingNotes:
          input.fields.messagingNotes?.trim() ||
          draft.messagingNotes.join("\n") ||
          null,
        profileJson: draft as unknown as Prisma.InputJsonValue,
        personaMessagingJson: {
          positioning: draft.personaSpecificPositioning,
          proofPoints: draft.proofPointsToEmphasize,
          objections: draft.likelyObjections,
        } as unknown as Prisma.InputJsonValue,
        approvedPersonaSetupRunId: run.id,
        approvedEvidenceBundleId: run.productEvidenceBundleId,
        setupStatus: "APPROVED",
        ...(protectTitles
          ? {}
          : {
              targetTitles: (draft.likelyTitles ??
                []) as unknown as Prisma.InputJsonValue,
            }),
      },
    });

    await tx.personaSetupRun.update({
      where: { id: run.id },
      data: {
        status: "APPROVED",
        completedAt: new Date(),
      },
    });
  });

  if (built.droppedCount > 0 || unmappedCriterionTypes.length > 0) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PERSONA_RESEARCH",
      operation: "PERSONA_SYNTHESIS",
      provider: run.aiProvider,
      model: run.aiModel,
      status: "SUCCESS",
      durationMs: 0,
      retryCount: 0,
      operationId: run.id,
      metadata: {
        personaSetupRunId: run.id,
        personaId: input.personaId,
        ...(built.droppedCount > 0
          ? {
              projectedCriteriaDropped: built.droppedCount,
              maxProjectedPersonaCriteria: policy.maxProjectedPersonaCriteria,
            }
          : {}),
        ...(unmappedCriterionTypes.length > 0
          ? { unmappedCriterionTypes }
          : {}),
      },
    });
  }
}
