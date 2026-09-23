/**
 * Persona research + synthesis for ONE buyer role.
 */

import "server-only";

import { Prisma } from "@prisma/client";
import {
  getAiConfigPublicSummary,
  getPersonaAiConfig,
  getPersonaAiProvider,
  isPersonaAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { AiValidationError } from "@/lib/ai/errors";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import { getResearchPolicy } from "@/lib/usage/policy";
import { createCorrelationId } from "@/lib/product-research/url";
import type { SuggestedBuyerRole } from "@/lib/product-research/contract";
import type { EvidenceExcerpt } from "@/lib/product-research/prompt";
import { selectProductEvidenceForPersona } from "@/lib/persona-research/compact";
import {
  PERSONA_SYNTHESIS_PROMPT_VERSION,
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { runProgressivePersonaWebSearch } from "@/lib/persona-research/progressive-search";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import {
  classifyProductSynthesisError,
  logProductSynthesisFailure,
} from "@/lib/product-research/synthesis-errors";
import { vocab } from "@/lib/product-config";

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

export type BuildPersonaInput = {
  organizationId: string;
  productId: string;
  userId: string | null;
  buyerRole: SuggestedBuyerRole;
  userContext?: {
    nameOverride?: string | null;
    notes?: string | null;
    likelyTitles?: string[];
    responsibilities?: string[];
  } | null;
};

export async function researchAndSynthesizePersona(
  input: BuildPersonaInput,
): Promise<{
  personaSetupRunId: string;
  status: "NEEDS_REVIEW" | "FAILED";
  draft: PersonaAiDraft | null;
  errorSafe?: string;
  correlationId: string;
}> {
  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) {
    throw new TenantError(`${vocab.product.Singular} not found in the active organization.`);
  }
  if (product.approvalStatus !== "APPROVED") {
    throw new TenantError(`Approve the ${vocab.product.Singular} before building a ${vocab.persona.Singular}.`);
  }

  const productBundleId =
    product.approvedEvidenceBundleId ||
    (
      await prisma.productEvidenceBundle.findFirst({
        where: {
          organizationId: input.organizationId,
          productId: input.productId,
        },
        orderBy: { version: "desc" },
      })
    )?.id;

  if (!productBundleId) {
    throw new TenantError(
      `No ${vocab.product.Singular} evidence bundle available. Run ${vocab.product.Singular} research first.`,
    );
  }

  const productBundle = await prisma.productEvidenceBundle.findFirst({
    where: {
      id: productBundleId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!productBundle) {
    throw new TenantError(`${vocab.product.Singular} evidence bundle not found.`);
  }

  const correlationId = createCorrelationId();
  const policy = await getResearchPolicy(input.organizationId);

  const run = await prisma.personaSetupRun.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      productEvidenceBundleId: productBundle.id,
      correlationId,
      status: "RESEARCHING",
      selectedBuyerRoleJson:
        input.buyerRole as unknown as Prisma.InputJsonValue,
      suggestionKey: input.buyerRole.suggestionKey,
      userContextJson: (input.userContext ??
        null) as unknown as Prisma.InputJsonValue,
      synthesisPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
      createdByUserId: input.userId,
    },
  });

  const allProductExcerpts = excerptsFromBundle(
    productBundle.normalizedEvidenceJson,
  );
  const relevantProduct = selectProductEvidenceForPersona({
    roleName: input.buyerRole.name,
    excerpts: allProductExcerpts,
  });
  const productEvidenceText = relevantProduct.map((e) => e.text).join("\n");
  const personaMaterialText = [
    input.userContext?.notes,
    ...(input.userContext?.responsibilities ?? []),
  ]
    .filter(Boolean)
    .join("\n");

  const progressive = await runProgressivePersonaWebSearch({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    correlationId,
    personaSetupRunId: run.id,
    roleName: input.buyerRole.name,
    productName: product.name,
    industryHint: null,
    productEvidenceText,
    personaMaterialText,
    maxSearchQueries: policy.maxSearchQueriesPerPersona,
    maxSources: policy.maxSourcesPerPersona,
    freshnessDays: policy.personaResearchFreshnessDays,
  });

  const personaBundle = await prisma.personaEvidenceBundle.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      personaSetupRunId: run.id,
      version: 1,
      correlationId,
      status: "SYNTHESIZING",
      createdByUserId: input.userId,
      productEvidenceBundleId: productBundle.id,
      webSearchQueriesUsed: progressive.webSearchQueriesUsed,
      sourceIdsJson: progressive.sourceIds as unknown as Prisma.InputJsonValue,
      normalizedEvidenceJson: {
        productEvidence: relevantProduct,
        personaEvidence: progressive.excerpts,
        stoppedReason: progressive.stoppedReason,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.personaSetupRun.update({
    where: { id: run.id },
    data: {
      personaEvidenceBundleId: personaBundle.id,
      status: "SYNTHESIZING",
    },
  });

  return synthesizePersonaFromEvidence({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    personaSetupRunId: run.id,
    correlationId,
    product,
    buyerRole: input.buyerRole,
    userContext: input.userContext ?? null,
    productEvidence: relevantProduct,
    personaEvidence: progressive.excerpts,
  });
}

export async function synthesizePersonaFromEvidence(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  personaSetupRunId: string;
  correlationId: string;
  product: {
    id: string;
    name: string;
    description: string | null;
    valueProposition: string | null;
    websiteUrl: string | null;
    profileJson: unknown;
    messagingJson: unknown;
  };
  buyerRole: SuggestedBuyerRole;
  userContext: BuildPersonaInput["userContext"];
  productEvidence: EvidenceExcerpt[];
  personaEvidence: Awaited<
    ReturnType<typeof runProgressivePersonaWebSearch>
  >["excerpts"];
  /** When re-synthesizing an approved persona, omit it from peer differentiation context. */
  excludePersonaIdFromPeers?: string;
}): Promise<{
  personaSetupRunId: string;
  status: "NEEDS_REVIEW" | "FAILED";
  draft: PersonaAiDraft | null;
  errorSafe?: string;
  correlationId: string;
}> {
  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;
  let stage = "config";

  const fail = async (error: unknown, failStage: string) => {
    const classified = classifyProductSynthesisError(error, failStage);
    logProductSynthesisFailure({
      event: "product_synthesis_error",
      organizationId: input.organizationId,
      productId: input.productId,
      setupRunId: input.personaSetupRunId,
      evidenceBundleId: input.personaSetupRunId,
      correlationId: input.correlationId,
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      endpoint: providerSummary?.modelUrlIdentifier ?? null,
      stage: `persona:${classified.stage}`,
      category: classified.category,
      httpStatus: classified.httpStatus,
      providerCode: classified.providerCode,
      providerType: classified.providerType,
      validationIssues: classified.validationIssues,
      durationMs: Date.now() - started,
      retryCount: 0,
      messageSafe: classified.messageSafe,
    });

    const errorSafe =
      "Persona synthesis could not be completed. Research evidence was preserved. You can retry synthesis.";

    await prisma.personaSetupRun.update({
      where: { id: input.personaSetupRunId },
      data: {
        status: "FAILED",
        errorSafe: `[${classified.category}] ${errorSafe}`,
        completedAt: new Date(),
        aiProvider: providerSummary?.provider,
        aiModel: providerSummary?.model,
      },
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PERSONA_RESEARCH",
      operation: "PERSONA_SYNTHESIS",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs: Date.now() - started,
      inputTokens:
        error instanceof AiValidationError
          ? (error.usage?.inputTokens ?? null)
          : null,
      outputTokens:
        error instanceof AiValidationError
          ? (error.usage?.outputTokens ?? null)
          : null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        personaSetupRunId: input.personaSetupRunId,
        errorCategory: classified.category,
        stage: classified.stage,
      },
    });

    return {
      personaSetupRunId: input.personaSetupRunId,
      status: "FAILED" as const,
      draft: null,
      errorSafe,
      correlationId: input.correlationId,
    };
  };

  if (!isPersonaAiConfigured()) {
    return fail(
      new TenantError(
        `${vocab.persona.Singular} AI is not configured. Set PERSONA_AI_* environment variables.`,
      ),
      "config",
    );
  }

  try {
    stage = "getPersonaAiProvider";
    const ai = getPersonaAiProvider();
    providerSummary = getAiConfigPublicSummary(getPersonaAiConfig());

    const approvedIcp = await prisma.icp.findFirst({
      where: {
        organizationId: input.organizationId,
        productId: input.productId,
        archivedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });

    const approvedPersonas = await prisma.persona.findMany({
      where: {
        organizationId: input.organizationId,
        productId: input.productId,
        archivedAt: null,
        approvalStatus: "APPROVED",
        ...(input.excludePersonaIdFromPeers
          ? { id: { not: input.excludePersonaIdFromPeers } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        painPoints: true,
        messagingNotes: true,
      },
      orderBy: { createdAt: "asc" },
    });
    const existingApprovedPersonas = approvedPersonas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      painPoints: parsePersonaListField(persona.painPoints),
      messagingNotes: parsePersonaListField(persona.messagingNotes),
    }));

    stage = "generateStructured";
    const response = await ai.generateStructured({
      ...structuredOutputRequest("personaSynthesis"),
      messages: buildPersonaSynthesisMessages({
        productName: input.product.name,
        productSnapshot: {
          name: input.product.name,
          description: input.product.description,
          valueProposition: input.product.valueProposition,
          websiteUrl: input.product.websiteUrl,
          profile: input.product.profileJson,
        },
        productMessaging:
          (input.product.messagingJson as Record<string, unknown> | null) ??
          null,
        buyerRole: {
          ...input.buyerRole,
          name: input.userContext?.nameOverride?.trim() || input.buyerRole.name,
        },
        userContext: input.userContext ?? null,
        productEvidence: input.productEvidence,
        personaEvidence: input.personaEvidence,
        icpContext: approvedIcp
          ? {
              name: approvedIcp.name,
              definition: approvedIcp.definition,
            }
          : null,
        existingApprovedPersonas,
      }),
      parseOutput: parsePersonaAiResponse,
    });

    stage = "validation";
    const draft = response.data.personaDraft;

    stage = "persist";
    await prisma.personaSetupRun.update({
      where: { id: input.personaSetupRunId },
      data: {
        status: "NEEDS_REVIEW",
        personaDraftJson: draft as unknown as Prisma.InputJsonValue,
        aiProvider: providerSummary.provider,
        aiModel: providerSummary.model,
        completedAt: new Date(),
        errorSafe: null,
      },
    });

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "PERSONA_RESEARCH",
      operation: "PERSONA_SYNTHESIS",
      provider: providerSummary.provider,
      model: providerSummary.model,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      inputTokens: response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.outputTokens ?? null,
      operationId: input.correlationId,
      metadata: {
        correlationId: input.correlationId,
        personaSetupRunId: input.personaSetupRunId,
        promptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
        ...(response.coercedFields?.length
          ? { coercedFields: response.coercedFields }
          : {}),
      },
    });

    return {
      personaSetupRunId: input.personaSetupRunId,
      status: "NEEDS_REVIEW",
      draft,
      correlationId: input.correlationId,
    };
  } catch (error) {
    return fail(error, stage);
  }
}

/** Retry Persona synthesis using preserved evidence (no Product/Persona re-search). */
export async function resynthesizePersonaFromRun(input: {
  organizationId: string;
  productId: string;
  userId: string | null;
  personaSetupRunId: string;
}): Promise<ReturnType<typeof researchAndSynthesizePersona>> {
  const prior = await prisma.personaSetupRun.findFirst({
    where: {
      id: input.personaSetupRunId,
      organizationId: input.organizationId,
      productId: input.productId,
    },
  });
  if (!prior) {
    throw new TenantError(`${vocab.persona.Singular} setup run not found.`);
  }

  const product = await prisma.product.findFirst({
    where: { id: input.productId, organizationId: input.organizationId },
  });
  if (!product) throw new TenantError(`${vocab.product.Singular} not found.`);

  const buyerRole = prior.selectedBuyerRoleJson as SuggestedBuyerRole | null;
  if (!buyerRole?.name) {
    throw new TenantError(`Prior run has no selected ${vocab.buyer.singular}.`);
  }

  let productEvidence: EvidenceExcerpt[] = [];
  let personaEvidence: Awaited<
    ReturnType<typeof runProgressivePersonaWebSearch>
  >["excerpts"] = [];

  if (prior.personaEvidenceBundleId) {
    const bundle = await prisma.personaEvidenceBundle.findFirst({
      where: {
        id: prior.personaEvidenceBundleId,
        organizationId: input.organizationId,
      },
    });
    const raw = bundle?.normalizedEvidenceJson as {
      productEvidence?: EvidenceExcerpt[];
      personaEvidence?: typeof personaEvidence;
    } | null;
    productEvidence = raw?.productEvidence ?? [];
    personaEvidence = raw?.personaEvidence ?? [];
  }

  if (productEvidence.length === 0) {
    const pb = await prisma.productEvidenceBundle.findFirst({
      where: {
        id: prior.productEvidenceBundleId,
        organizationId: input.organizationId,
      },
    });
    productEvidence = selectProductEvidenceForPersona({
      roleName: buyerRole.name,
      excerpts: excerptsFromBundle(pb?.normalizedEvidenceJson),
    });
  }

  const correlationId = prior.correlationId;
  const run = await prisma.personaSetupRun.create({
    data: {
      organizationId: input.organizationId,
      productId: input.productId,
      personaId: prior.personaId ?? undefined,
      productEvidenceBundleId: prior.productEvidenceBundleId,
      personaEvidenceBundleId: prior.personaEvidenceBundleId,
      correlationId,
      status: "SYNTHESIZING",
      selectedBuyerRoleJson: prior.selectedBuyerRoleJson ?? undefined,
      suggestionKey: prior.suggestionKey,
      userContextJson: prior.userContextJson ?? undefined,
      synthesisPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
      createdByUserId: input.userId,
    },
  });

  return synthesizePersonaFromEvidence({
    organizationId: input.organizationId,
    productId: input.productId,
    userId: input.userId,
    personaSetupRunId: run.id,
    correlationId,
    product,
    buyerRole,
    userContext:
      (prior.userContextJson as BuildPersonaInput["userContext"]) ?? null,
    productEvidence,
    personaEvidence,
    excludePersonaIdFromPeers: prior.personaId ?? undefined,
  });
}
