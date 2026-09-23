import "server-only";

import { prisma } from "@/lib/prisma";
import { TenantError } from "@/lib/tenant/errors";
import { projectSignalsFromProfileJson } from "@/lib/persona-research/project-signals";
import { getResearchPolicy } from "@/lib/usage/policy";
import { recordUsageEvent } from "@/lib/usage/events";
import { vocab } from "@/lib/product-config";

export async function projectPersonaSignalsFromProfile(input: {
  organizationId: string;
  personaId: string;
  userId?: string | null;
}): Promise<number> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} not found in the active organization.`);
  }
  if (!persona.profileJson) {
    return 0;
  }

  const policy = await getResearchPolicy(input.organizationId);

  const existing = await prisma.personaCriterion.findMany({
    where: { organizationId: input.organizationId, personaId: persona.id },
    select: { name: true, criterionType: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  const { criteria: toInsert, droppedCount } = projectSignalsFromProfileJson(
    persona.profileJson,
    existing,
    { maxCriteria: policy.maxProjectedPersonaCriteria },
  );
  if (toInsert.length === 0) return 0;

  const baseSort =
    existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  for (const [offset, row] of toInsert.entries()) {
    await prisma.personaCriterion.create({
      data: {
        organizationId: input.organizationId,
        personaId: persona.id,
        name: row.name,
        description: row.description,
        criterionType: row.criterionType,
        dataType: "TEXT",
        operator: row.operator,
        importance: row.importance,
        isRequired: row.isRequired,
        isDisqualifier: row.isDisqualifier,
        exclusionTestability: row.isDisqualifier
          ? (row.exclusionTestability ?? "EVIDENCE_TESTABLE")
          : null,
        researchGuidance: row.researchGuidance,
        source: row.source,
        sortOrder: baseSort + offset,
        manuallyEdited: false,
      },
    });
  }

  if (droppedCount > 0) {
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      category: "PERSONA_RESEARCH",
      operation: "PERSONA_SYNTHESIS",
      provider: null,
      model: null,
      status: "SUCCESS",
      durationMs: 0,
      retryCount: 0,
      operationId: persona.id,
      metadata: {
        personaId: persona.id,
        projectedCriteriaInserted: toInsert.length,
        projectedCriteriaDropped: droppedCount,
        maxProjectedPersonaCriteria: policy.maxProjectedPersonaCriteria,
      },
    });
  }

  return toInsert.length;
}
