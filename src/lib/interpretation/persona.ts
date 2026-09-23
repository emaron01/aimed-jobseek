import "server-only";

import type { PersonaCriterion, Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import {
  getInterpretationAiConfig,
  getInterpretationAiProvider,
  getAiConfigPublicSummary,
  isInterpretationAiConfigured,
} from "@/lib/ai";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import {
  buildLegacyPersonaCriteria,
  ensurePersonaLegacyCriteriaBackfilled,
} from "@/lib/criteria/legacy-backfill";
import { planCriterionReinterpretation } from "@/lib/criteria/merge";
import {
  PERSONA_INTERPRETATION_PROMPT_VERSION,
  type CriterionSnapshot,
  type InterpretedCriterionDraft,
} from "@/lib/criteria/types";
import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { recordUsageEvent } from "@/lib/usage/events";
import {
  interpretationResultSchema,
  parseInterpretedCriteria,
} from "@/lib/interpretation/schema";
import { buildPersonaInterpretationMessages } from "@/lib/interpretation/persona-prompt";
import { sanitizePersonaInterpretedCriteria } from "@/lib/interpretation/persona-sanitize";
import type { PersonaAuthoritativeFields } from "@/lib/persona/save";
import { vocab } from "@/lib/product-config";

function criterionRowToSnapshot(row: PersonaCriterion): CriterionSnapshot {
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
    source: row.source,
    confidence: row.confidence,
    manuallyEdited: row.manuallyEdited,
    sortOrder: row.sortOrder,
  };
}

function personaToAuthoritativeFields(persona: {
  name: string;
  definition: string | null;
  additionalContext: string | null;
  targetTitles: unknown;
  department: string | null;
  seniority: string | null;
  responsibilities: string | null;
  painPoints: string | null;
  desiredOutcomes: string | null;
  messagingNotes: string | null;
}): PersonaAuthoritativeFields {
  const titles = Array.isArray(persona.targetTitles)
    ? persona.targetTitles.map(String).filter(Boolean)
    : [];
  return {
    name: persona.name,
    definition: persona.definition,
    additionalContext: persona.additionalContext,
    targetTitles: titles,
    department: persona.department,
    seniority: persona.seniority,
    responsibilities: persona.responsibilities,
    painPoints: persona.painPoints,
    desiredOutcomes: persona.desiredOutcomes,
    messagingNotes: persona.messagingNotes,
  };
}

export async function listPersonaCriteria(
  organizationId: string,
  personaId: string,
): Promise<CriterionSnapshot[]> {
  const rows = await prisma.personaCriterion.findMany({
    where: { organizationId, personaId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(criterionRowToSnapshot);
}

export async function updatePersonaCriterionManual(input: {
  organizationId: string;
  personaId: string;
  criterionId: string;
  data: Partial<
    Pick<
      PersonaCriterion,
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
    >
  >;
}): Promise<CriterionSnapshot> {
  const existing = await prisma.personaCriterion.findFirst({
    where: {
      id: input.criterionId,
      organizationId: input.organizationId,
      personaId: input.personaId,
    },
  });
  if (!existing) {
    throw new TenantError(
      `${vocab.persona.Singular} criterion not found in the active organization.`,
    );
  }

  const updated = await prisma.personaCriterion.update({
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
      researchGuidance: input.data.researchGuidance,
      sortOrder: input.data.sortOrder,
      manuallyEdited: true,
      source: "MANUAL",
    },
  });
  return criterionRowToSnapshot(updated);
}

function draftToCreateData(
  organizationId: string,
  personaId: string,
  d: InterpretedCriterionDraft,
): Prisma.PersonaCriterionCreateManyInput {
  return {
    organizationId,
    personaId,
    name: d.name,
    description: d.description ?? null,
    criterionType: d.criterionType,
    dataType: d.dataType,
    operator: d.operator,
    targetValue: d.targetValue as Prisma.InputJsonValue,
    minValue: d.minValue as Prisma.InputJsonValue,
    maxValue: d.maxValue as Prisma.InputJsonValue,
    allowedValues: d.allowedValues as Prisma.InputJsonValue,
    importance: d.importance,
    isRequired: d.isRequired,
    isDisqualifier: d.isDisqualifier,
    researchGuidance: d.researchGuidance ?? null,
    source:
      (d.source as "AI_INTERPRETED" | "MANUAL" | "MIGRATED_FROM_LEGACY") ??
      "AI_INTERPRETED",
    sortOrder: d.sortOrder,
    manuallyEdited: false,
  };
}

async function persistLegacyCriteria(
  organizationId: string,
  personaId: string,
): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  await ensurePersonaLegacyCriteriaBackfilled(organizationId, personaId);
  const persona = await prisma.persona.findFirst({
    where: { id: personaId, organizationId },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }

  const count = await prisma.personaCriterion.count({
    where: { organizationId, personaId },
  });
  if (count === 0) {
    const drafts = buildLegacyPersonaCriteria(persona);
    if (drafts.length > 0) {
      await prisma.personaCriterion.createMany({
        data: drafts.map((d) =>
          draftToCreateData(organizationId, personaId, d),
        ),
      });
    }
  }

  const criteria = await listPersonaCriteria(organizationId, personaId);
  return { criteria, version: persona.interpretationVersion };
}

export async function interpretPersonaDefinition(input: {
  organizationId: string;
  personaId: string;
  userId?: string | null;
}): Promise<{ criteria: CriterionSnapshot[]; version: number }> {
  const persona = await prisma.persona.findFirst({
    where: { id: input.personaId, organizationId: input.organizationId },
    include: { product: true, criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }

  const fields = personaToAuthoritativeFields(persona);
  const hasAuthoritativeInput =
    Boolean(fields.definition?.trim()) ||
    Boolean(fields.responsibilities?.trim()) ||
    Boolean(fields.painPoints?.trim()) ||
    Boolean(fields.desiredOutcomes?.trim()) ||
    Boolean(fields.department?.trim()) ||
    Boolean(fields.seniority?.trim()) ||
    fields.targetTitles.length > 0 ||
    Boolean(fields.additionalContext?.trim());

  if (!hasAuthoritativeInput) {
    throw new TenantError(
      `${vocab.persona.Singular} requires a definition or role fields before interpretation.`,
    );
  }

  if (!isInterpretationAiConfigured()) {
    return persistLegacyCriteria(input.organizationId, input.personaId);
  }

  const existingSnapshots = persona.criteria.map(criterionRowToSnapshot);
  const started = Date.now();
  let providerSummary: ReturnType<typeof getAiConfigPublicSummary> | null =
    null;

  try {
    const ai = getInterpretationAiProvider();
    providerSummary = getAiConfigPublicSummary(getInterpretationAiConfig());

    const response = await ai.generateStructured({
      ...structuredOutputRequest("personaInterpretation"),
      messages: buildPersonaInterpretationMessages({
        productName: persona.product.name,
        productDescription: persona.product.description,
        fields,
        existingCriteria: existingSnapshots,
      }),
    });

    const parsed = parseInterpretedCriteria(response.data);
    const aiDrafts: InterpretedCriterionDraft[] =
      sanitizePersonaInterpretedCriteria(
        parsed.criteria.map((c) => ({
          ...c,
          source: "AI_INTERPRETED",
        })),
      );

    if (aiDrafts.length === 0) {
      throw new TenantError(
        `Interpretation produced no usable criteria. Adjust the ${vocab.persona.Singular} definition and try again.`,
      );
    }

    const plan = planCriterionReinterpretation({
      existing: persona.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        criterionType: c.criterionType,
        manuallyEdited: c.manuallyEdited,
      })),
      aiDrafts,
    });

    const newVersion = persona.interpretationVersion + 1;
    const now = new Date();

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

      if (plan.insertDrafts.length > 0) {
        await tx.personaCriterion.createMany({
          data: plan.insertDrafts.map((d) =>
            draftToCreateData(input.organizationId, input.personaId, d),
          ),
        });
      }

      await tx.persona.update({
        where: { id: input.personaId },
        data: {
          interpretationVersion: newVersion,
          interpretationPromptVersion: PERSONA_INTERPRETATION_PROMPT_VERSION,
          lastInterpretedAt: now,
          // Never rewrite targetTitles. Rep-approved titles live on Persona and
          // are protected by manuallyEditedFields on research re-approval.
        },
      });
    });

    const criteria = await listPersonaCriteria(
      input.organizationId,
      input.personaId,
    );

    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "PERSONA_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "SUCCESS",
      durationMs: Date.now() - started,
      metadata: {
        personaId: input.personaId,
        criteriaCount: criteria.length,
        promptVersion: PERSONA_INTERPRETATION_PROMPT_VERSION,
        version: newVersion,
      },
    });

    return { criteria, version: newVersion };
  } catch (error) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId,
      category: "INTERPRETATION",
      operation: "PERSONA_INTERPRETATION",
      provider: providerSummary?.provider ?? null,
      model: providerSummary?.model ?? null,
      status: "FAILED",
      durationMs: Date.now() - started,
      metadata: {
        personaId: input.personaId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}
