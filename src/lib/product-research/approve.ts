import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import type {
  PersonaDraft,
  ProductMessagingDraft,
  SuggestedPersona,
} from "@/lib/product-research/contract";
import {
  parseCandidateProfileSafe,
  productFieldsFromCandidateProfile,
  type CandidateProfile,
} from "@/lib/product-research/candidate-profile";
import { vocab } from "@/lib/product-config";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function mergeProtectedFields(
  existing: unknown,
  incoming: string[],
): string[] {
  const prev = asStringArray(existing);
  return [...new Set([...prev, ...incoming])];
}

/**
 * User save = validation. Writes authoritative Product fields.
 * Does not overwrite manuallyEdited field paths from a prior approval
 * when applying a draft unless the user explicitly includes those fields
 * in the submitted form (passed as `editedFields`).
 */
export async function approveProductFromDraft(input: {
  organizationId: string;
  productId: string;
  userId: string;
  setupRunId: string;
  /** Form-submitted authoritative values (user may have edited). */
  fields: {
    name: string;
    description: string | null;
    valueProposition: string | null;
    websiteUrl: string | null;
    averageOrderValue: number | null;
  };
  profile?: CandidateProfile | null;
  messaging?: ProductMessagingDraft | null;
  /** Fields the user touched in this save — become protected. */
  editedFields?: string[];
}): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }

  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: input.setupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!run) {
    throw new TenantError(`Setup run not found for this ${vocab.product.singular}.`);
  }

  const protectedPaths = mergeProtectedFields(
    product.manuallyEditedFields,
    input.editedFields ?? [],
  );

  const submittedProfile = input.profile ?? run.productDraftJson;
  const parsedProfile = parseCandidateProfileSafe(submittedProfile);
  if (!parsedProfile.ok) {
    throw new TenantError(parsedProfile.error);
  }
  const mirrored = productFieldsFromCandidateProfile(parsedProfile.profile);

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: input.fields.name,
      description: input.fields.description ?? mirrored.description,
      valueProposition:
        input.fields.valueProposition ?? mirrored.valueProposition,
      websiteUrl: input.fields.websiteUrl,
      averageOrderValue:
        input.fields.averageOrderValue != null
          ? new Prisma.Decimal(input.fields.averageOrderValue)
          : null,
      profileJson: parsedProfile.profile as unknown as Prisma.InputJsonValue,
      messagingJson: (input.messaging ??
        run.messagingDraftJson) as Prisma.InputJsonValue,
      manuallyEditedFields: protectedPaths as unknown as Prisma.InputJsonValue,
      approvalStatus: "APPROVED",
      setupStatus: "APPROVED",
      approvedAt: new Date(),
      approvedByUserId: input.userId,
      approvedEvidenceBundleId: run.evidenceBundleId,
      approvedSetupRunId: run.id,
    },
  });
}

/**
 * Create or update an authoritative Persona from a suggested draft.
 * Saving validates. Criteria are created as AI_INTERPRETED (not manuallyEdited).
 */
export async function approvePersonaFromDraft(input: {
  organizationId: string;
  productId: string;
  userId: string;
  setupRunId: string;
  suggestion: SuggestedPersona;
  draft: PersonaDraft;
  /** Optional existing persona id to update. */
  personaId?: string | null;
}): Promise<string> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }

  const run = await prisma.productSetupRun.findFirst({
    where: {
      id: input.setupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!run) {
    throw new TenantError(`Setup run not found for this ${vocab.product.singular}.`);
  }

  const definition =
    input.draft.definition?.trim() ||
    input.suggestion.whyThisPersonaMatters ||
    input.suggestion.whyThisRoleMatters ||
    null;
  const responsibilities = (input.draft.responsibilities ?? []).join("\n") || null;
  const painPoints = (input.draft.painPoints ?? []).join("\n") || null;
  const desiredOutcomes =
    (input.draft.desiredOutcomesFromYourSolution ?? []).join("\n") || null;

  let personaId = input.personaId?.trim() || "";

  if (personaId) {
    const existing = await prisma.persona.findFirst({
      where: {
        id: personaId,
        organizationId: input.organizationId,
        productId: input.productId,
      },
    });
    if (!existing) {
      throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
    }
    const protectedPaths = asStringArray(existing.manuallyEditedFields);
    await prisma.persona.update({
      where: { id: existing.id },
      data: {
        name: protectedPaths.includes("name") ? existing.name : input.draft.name,
        definition: protectedPaths.includes("definition")
          ? existing.definition
          : definition,
        targetTitles: protectedPaths.includes("targetTitles")
          ? (existing.targetTitles as Prisma.InputJsonValue)
          : (input.draft.likelyTitles as unknown as Prisma.InputJsonValue),
        department: protectedPaths.includes("department")
          ? existing.department
          : input.draft.department,
        seniority: protectedPaths.includes("seniority")
          ? existing.seniority
          : input.draft.seniority,
        responsibilities: protectedPaths.includes("responsibilities")
          ? existing.responsibilities
          : responsibilities,
        painPoints: protectedPaths.includes("painPoints")
          ? existing.painPoints
          : painPoints,
        desiredOutcomes: protectedPaths.includes("desiredOutcomes")
          ? existing.desiredOutcomes
          : desiredOutcomes,
        messagingNotes: protectedPaths.includes("messagingNotes")
          ? existing.messagingNotes
          : input.draft.messagingNotes,
        whyThisPersonaMatters: input.suggestion.whyThisPersonaMatters,
        suggestionKey: input.suggestion.suggestionKey,
        personaMessagingJson: {
          positioning: input.draft.personaPositioning,
          proofPoints: input.draft.relevantProofPoints,
          objections: input.draft.likelyObjections,
        } as unknown as Prisma.InputJsonValue,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: input.userId,
        approvedEvidenceBundleId: run.evidenceBundleId,
        approvedSetupRunId: run.id,
      },
    });
  } else {
    const created = await prisma.persona.create({
      data: {
        organizationId: input.organizationId,
        productId: input.productId,
        name: input.draft.name,
        definition,
        targetTitles: input.draft.likelyTitles as unknown as Prisma.InputJsonValue,
        department: input.draft.department,
        seniority: input.draft.seniority,
        responsibilities,
        painPoints,
        desiredOutcomes,
        messagingNotes: input.draft.messagingNotes,
        whyThisPersonaMatters: input.suggestion.whyThisPersonaMatters,
        suggestionKey: input.suggestion.suggestionKey,
        personaMessagingJson: {
          positioning: input.draft.personaPositioning,
          proofPoints: input.draft.relevantProofPoints,
          objections: input.draft.likelyObjections,
        } as unknown as Prisma.InputJsonValue,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: input.userId,
        approvedEvidenceBundleId: run.evidenceBundleId,
        approvedSetupRunId: run.id,
      },
    });
    personaId = created.id;
  }

  // Replace non-manual criteria with draft criteria from this approval
  await prisma.personaCriterion.deleteMany({
    where: {
      organizationId: input.organizationId,
      personaId,
      manuallyEdited: false,
    },
  });

  const criteria = input.draft.criteria ?? [];
  if (criteria.length > 0) {
    await prisma.personaCriterion.createMany({
      data: criteria.map((c, i) => {
        const op = typeof c.operator === "string" ? c.operator : "";
        const operator = (
          ["EXISTS", "CONTAINS", "IN", "EQUALS"].includes(op) ? op : "EXISTS"
        ) as "EXISTS";
        return {
          organizationId: input.organizationId,
          personaId,
          name: String(c.name ?? ""),
          description:
            c.description == null ? null : String(c.description),
          criterionType: String(c.criterionType ?? "OTHER"),
          dataType: "TEXT" as const,
          operator,
          targetValue: (c.targetValue ?? c.name) as Prisma.InputJsonValue,
          importance: (typeof c.importance === "string"
            ? c.importance
            : "MEDIUM") as "MEDIUM",
          isRequired: Boolean(c.isRequired),
          isDisqualifier: Boolean(c.isDisqualifier),
          researchGuidance:
            c.researchGuidance == null
              ? input.draft.researchGuidance
              : String(c.researchGuidance),
          source: "AI_INTERPRETED" as const,
          sortOrder: i,
          manuallyEdited: false,
        };
      }),
    });
  }

  return personaId;
}
