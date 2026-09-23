/**
 * Approve Persona from staged PersonaSetupRun draft.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import type { PersonaAiDraft } from "@/lib/persona-research/contract";
import {
  buildPersonaCriteriaForReview,
  collectUnmappedCriterionTypesFromDraft,
  type PersonaCriterionFormRow,
} from "@/lib/persona-research/project-signals";
import { getResearchPolicy } from "@/lib/usage/policy";
import { recordUsageEvent } from "@/lib/usage/events";
import { vocab } from "@/lib/product-config";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function mergeProtectedFields(existing: unknown, incoming: string[]): string[] {
  const prev = asStringArray(existing);
  return [...new Set([...prev, ...incoming])];
}

export async function approvePersonaFromSetupRun(input: {
  organizationId: string;
  productId: string;
  userId: string;
  personaSetupRunId: string;
  fields: {
    name: string;
    department: string | null;
    seniority: string | null;
    definition: string | null;
    likelyTitles: string[];
    responsibilities: string[];
    painPoints: string[];
    desiredOutcomes: string[];
    messagingNotes: string | null;
  };
  editedFields?: string[];
  /** User-reviewed criteria from PersonaDraftReview (includes projected signals). */
  criteria?: PersonaCriterionFormRow[];
}): Promise<string> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }
  if (product.approvalStatus !== "APPROVED") {
    throw new TenantError(`${vocab.product.Singular} must be approved before approving a ${vocab.persona.Singular}.`);
  }

  const run = await prisma.personaSetupRun.findFirst({
    where: {
      id: input.personaSetupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!run?.personaDraftJson) {
    throw new TenantError(`${vocab.persona.Singular} setup run draft not found.`);
  }

  const draft = run.personaDraftJson as PersonaAiDraft;
  const protectedPaths = mergeProtectedFields([], input.editedFields ?? []);

  const created = await prisma.persona.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      name: input.fields.name,
      definition:
        input.fields.definition ||
        draft.roleSummary ||
        null,
      targetTitles: input.fields.likelyTitles as unknown as Prisma.InputJsonValue,
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
        input.fields.messagingNotes ||
        draft.messagingNotes.join("\n") ||
        null,
      whyThisPersonaMatters:
        (run.selectedBuyerRoleJson as { whyThisRoleMatters?: string } | null)
          ?.whyThisRoleMatters ?? null,
      suggestionKey: run.suggestionKey,
      profileJson: draft as unknown as Prisma.InputJsonValue,
      personaMessagingJson: {
        positioning: draft.personaSpecificPositioning,
        proofPoints: draft.proofPointsToEmphasize,
        objections: draft.likelyObjections,
      } as unknown as Prisma.InputJsonValue,
      manuallyEditedFields: protectedPaths as unknown as Prisma.InputJsonValue,
      approvalStatus: "APPROVED",
      setupStatus: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: input.userId,
      approvedEvidenceBundleId: run.productEvidenceBundleId,
      approvedSetupRunId: null,
      approvedPersonaSetupRunId: run.id,
    },
  });

  // Criteria: user-reviewed list, or merge draft.criteria + projected signals.
  const policy = await getResearchPolicy(input.organizationId);
  const built = buildPersonaCriteriaForReview(draft, {
    maxCriteria: policy.maxProjectedPersonaCriteria,
  });
  // Always derive unmapped types from the AI draft — even when the form supplies
  // criteriaJson (the common path). Skipping build previously left logging empty.
  const unmappedCriterionTypes = collectUnmappedCriterionTypesFromDraft(draft);
  const projectedCriteriaDropped = built.droppedCount;
  const criteriaRows =
    input.criteria && input.criteria.length > 0
      ? input.criteria
      : built.criteria;

  for (const [i, c] of criteriaRows.entries()) {
    const name = c.name.trim();
    if (!name) continue;
    await prisma.personaCriterion.create({
      data: {
        organizationId: input.organizationId,
        personaId: created.id,
        name,
        description: c.description ?? null,
        criterionType: c.criterionType.trim() || "responsibility",
        dataType: "TEXT",
        operator: "EXISTS",
        importance: c.importance ?? "MEDIUM",
        isRequired: c.isRequired ?? false,
        isDisqualifier: c.isDisqualifier ?? false,
        exclusionTestability: c.isDisqualifier
          ? (c.exclusionTestability ?? "EVIDENCE_TESTABLE")
          : null,
        researchGuidance: c.researchGuidance ?? null,
        source: "AI_INTERPRETED",
        sortOrder: i,
        manuallyEdited: c.manuallyEdited ?? false,
      },
    });
  }

  // Attach research sources from this run to the approved Persona (Cascade FK).
  await prisma.personaSource.updateMany({
    where: {
      organizationId: input.organizationId,
      personaSetupRunId: run.id,
    },
    data: { personaId: created.id },
  });

  await prisma.personaSetupRun.update({
    where: { id: run.id },
    data: {
      status: "APPROVED",
      personaId: created.id,
      completedAt: new Date(),
    },
  });

  if (projectedCriteriaDropped > 0 || unmappedCriterionTypes.length > 0) {
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
        personaId: created.id,
        ...(projectedCriteriaDropped > 0
          ? {
              projectedCriteriaDropped,
              maxProjectedPersonaCriteria: policy.maxProjectedPersonaCriteria,
            }
          : {}),
        ...(unmappedCriterionTypes.length > 0
          ? { unmappedCriterionTypes }
          : {}),
      },
    });
  }

  return created.id;
}
