import "server-only";

import { resolveIcpQualification } from "@/lib/scoring/icp-qualification";
import { SCORING_LOGIC_VERSION } from "@/lib/scoring/config";
import { buildExclusionDetails } from "@/lib/scoring/exclusion-detail";
import {
  evaluatePersonaExclusions,
  type PersonaExclusionAssessment,
} from "@/lib/scoring/persona-exclusions";
import {
  evaluatePersonaTitleGate,
  type TitleGateStatus,
} from "@/lib/scoring/title-fit";
import type {
  IcpSnapshot,
  PersonaSnapshot,
  ProductSnapshot,
} from "@/lib/scoring/types";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/org/authz";
import { recordUsageEvent } from "@/lib/usage/events";
import { TenantError } from "@/lib/tenant/getCurrentOrganization";
import { parseStringArray } from "@/lib/research";
import type { Prisma, ResearchStatus } from "@prisma/client";
import {
  deterministicContactQualification,
  type DeterministicQualificationSkipReason,
} from "@/lib/workflow/qualification";
import { vocab } from "@/lib/product-config";

export type ScoreContactResult = {
  contactScoreId: string;
  contactId: string;
  ok: boolean;
  error?: string;
};

export type PersonaAssessmentRecord = {
  personaId: string;
  personaName: string;
  gate: TitleGateStatus;
  reason: string;
  matchedTitle?: string;
  overallScore: number | null;
  personaScore: number | null;
  scoreLabel: string | null;
  aiCalled: boolean;
};

function toResearchInput(
  research: {
    status: string;
    researchConfidence: string | null;
    companySummary: string | null;
    whatTheySell: string | null;
    customerTypes: unknown;
    primaryMarkets: unknown;
    businessModel: string | null;
    estimatedAov: string | null;
    aovReasoning: string | null;
    companySizeContext: string | null;
    relevantTechnologies: unknown;
    buyingSignals: unknown;
    riskSignals: unknown;
    researchedAt: Date | null;
  } | null,
) {
  if (!research) return null;
  return {
    status: research.status,
    researchConfidence: research.researchConfidence,
    companySummary: research.companySummary,
    whatTheySell: research.whatTheySell,
    customerTypes: parseStringArray(research.customerTypes),
    primaryMarkets: parseStringArray(research.primaryMarkets),
    businessModel: research.businessModel,
    estimatedAov: research.estimatedAov,
    aovReasoning: research.aovReasoning,
    companySizeContext: research.companySizeContext,
    relevantTechnologies: parseStringArray(research.relevantTechnologies),
    buyingSignals: parseStringArray(research.buyingSignals),
    riskSignals: parseStringArray(research.riskSignals),
    researchedAt: research.researchedAt?.toISOString() ?? null,
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function recommendedActionForBucket(
  bucket: ReturnType<typeof deterministicContactQualification>["bucket"],
  reason: string,
): string {
  switch (bucket) {
    case "GOOD":
      return "Ready to include in outreach.";
    case "EXCLUDED":
      return reason;
    case "NEEDS_REVIEW":
      return `Check before including — ${reason.replace(/[.]+$/, "")}.`;
    default:
      return reason;
  }
}

export async function scoreSingleContact(input: {
  organizationId: string;
  scoringRunId: string;
  contactScoreId: string;
  product: ProductSnapshot;
  icp: IcpSnapshot;
  persona: PersonaSnapshot;
  personas?: PersonaSnapshot[];
}): Promise<ScoreContactResult> {
  const personas =
    input.personas && input.personas.length > 0
      ? input.personas
      : [input.persona];
  const applyPositiveFit = personas.length > 1;

  const scoreRow = await prisma.contactScore.findFirst({
    where: {
      id: input.contactScoreId,
      organizationId: input.organizationId,
      scoringRunId: input.scoringRunId,
    },
    include: {
      contact: {
        include: {
          companyRecord: {
            include: {
              research: {
                orderBy: { updatedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!scoreRow) {
    throw new TenantError(
      `${vocab.contact.Singular} score not found in the active organization.`,
    );
  }

  await prisma.contactScore.update({
    where: { id: scoreRow.id },
    data: { scoringStatus: "IN_PROGRESS" },
  });

  try {
    const contact = scoreRow.contact;
    const company = contact.companyRecord;
    const latestResearch = company?.research[0] ?? null;

    const { resolveCompanyActualWithProvenance } =
      await import("@/lib/criteria/research-cascade");
    const { evaluateIcpCriterionWithEvidenceClass } =
      await import("@/lib/criteria/targeted-search-eval");
    const criterionAssessments: Array<
      ReturnType<typeof evaluateIcpCriterionWithEvidenceClass>
    > = [];
    for (const criterion of input.icp.criteria ?? []) {
      const resolution = resolveCompanyActualWithProvenance(
        criterion,
        {
          industry: company?.industry ?? contact.industry,
          employeeCount: company?.employeeCount ?? contact.employeeCount,
          revenue: company?.revenue ?? contact.revenue,
          location: company?.location ?? contact.location,
        },
        latestResearch
          ? {
              relevantTechnologies: parseStringArray(
                latestResearch.relevantTechnologies,
              ),
              buyingSignals: parseStringArray(latestResearch.buyingSignals),
              riskSignals: parseStringArray(latestResearch.riskSignals),
              primaryMarkets: parseStringArray(latestResearch.primaryMarkets),
              companySizeContext: latestResearch.companySizeContext,
              companySummary: latestResearch.companySummary,
              whatTheySell: latestResearch.whatTheySell,
              businessModel: latestResearch.businessModel,
            }
          : null,
      );
      criterionAssessments.push(
        evaluateIcpCriterionWithEvidenceClass({
          criterion,
          actualValue: resolution.provenance?.hedged ? null : resolution.value,
          provenance: resolution.provenance,
        }),
      );
    }

    const researchStatus: ResearchStatus =
      !latestResearch || latestResearch.status === "NOT_STARTED"
        ? "NOT_STARTED"
        : latestResearch.status === "FAILED"
          ? "FAILED"
          : latestResearch.status === "COMPLETED" ||
              latestResearch.status === "PARTIAL"
            ? "COMPLETED"
            : "IN_PROGRESS";

    const icpQualification = resolveIcpQualification({
      criteria: input.icp.criteria ?? [],
      assessments: criterionAssessments,
    });

    const gates = personas.map((persona) =>
      evaluatePersonaTitleGate({
        persona,
        contactTitle: contact.title,
        applyPositiveFit,
      }),
    );
    const gateById = new Map(gates.map((gate) => [gate.personaId, gate]));
    let candidatePersonas = personas.filter(
      (persona) => gateById.get(persona.id)?.status === "CANDIDATE",
    );

    const assessments: PersonaAssessmentRecord[] = gates.map((gate) => ({
      personaId: gate.personaId,
      personaName: gate.personaName,
      gate: gate.status,
      reason: gate.reason,
      matchedTitle: gate.matchedTitle,
      overallScore: null,
      personaScore: null,
      scoreLabel: null,
      aiCalled: false,
    }));
    const assessmentById = new Map(
      assessments.map((row) => [row.personaId, row]),
    );

    const excludedPersonaIds: string[] = [];
    const personaExclusionAssessments: PersonaExclusionAssessment[] = [];
    const addConfirmedPersonaExclusions = (persona: PersonaSnapshot) => {
      for (const row of evaluatePersonaExclusions({
        criteria: persona.criteria ?? [],
        title: contact.title,
        contactResearch: null,
      })) {
        if (row.outcome !== "CONFIRMED") continue;
        const key = row.criterionId ?? row.criterion;
        if (
          personaExclusionAssessments.some(
            (existing) => (existing.criterionId ?? existing.criterion) === key,
          )
        ) {
          continue;
        }
        personaExclusionAssessments.push(row);
      }
    };
    const stillCandidates: PersonaSnapshot[] = [];
    for (const persona of candidatePersonas) {
      const confirmed = evaluatePersonaExclusions({
        criteria: persona.criteria ?? [],
        title: contact.title,
        contactResearch: null,
      }).filter((row) => row.outcome === "CONFIRMED");
      if (confirmed.length > 0) {
        excludedPersonaIds.push(persona.id);
        addConfirmedPersonaExclusions(persona);
        const row = assessmentById.get(persona.id);
        if (row) {
          row.gate = "EXCLUDED";
          row.reason =
            confirmed[0]?.reasoning ??
            "Contact title confirms a persona exclusion.";
          row.scoreLabel = "DISQUALIFIED";
        }
      } else {
        stillCandidates.push(persona);
      }
    }
    candidatePersonas = stillCandidates;

    const hadTitleCandidate = gates.some((gate) => gate.status === "CANDIDATE");
    const anyUnknownTitle = assessments.some((row) => row.gate === "UNKNOWN");
    const titleExcludedPersonaIds = gates
      .filter((gate) => gate.status === "EXCLUDED")
      .map((gate) => gate.personaId);
    for (const personaId of titleExcludedPersonaIds) {
      const persona = personas.find((row) => row.id === personaId);
      if (persona) addConfirmedPersonaExclusions(persona);
    }

    const qualification = deterministicContactQualification({
      icpQualification,
      criteria: input.icp.criteria ?? [],
      criterionAssessments,
      candidatePersonas: candidatePersonas.map((persona) => ({
        id: persona.id,
        name: persona.name,
      })),
      excludedPersonaIds,
      titleExcludedPersonaIds,
      hadTitleCandidate,
      anyUnknownTitle,
    });

    const matchedPersona =
      qualification.matchedPersonaId != null
        ? (personas.find((row) => row.id === qualification.matchedPersonaId) ??
          null)
        : null;

    const companyFields = {
      companySummary: latestResearch?.companySummary ?? null,
      whatTheySell: latestResearch?.whatTheySell ?? null,
      estimatedAov: latestResearch?.estimatedAov ?? null,
      aovReasoning: latestResearch?.aovReasoning ?? null,
      researchStatus,
      researchSources: latestResearch?.researchSources ?? undefined,
      researchedAt: latestResearch?.researchedAt ?? null,
      companyResearchId: latestResearch?.id ?? null,
      companyResearchAt: latestResearch?.researchedAt ?? null,
      contactResearchId: null,
      contactResearchAt: null,
      criterionAssessments: jsonValue(criterionAssessments),
      personaAssessments: jsonValue(assessments),
      scoringLogicVersion: SCORING_LOGIC_VERSION,
      scoredAt: new Date(),
      scoringError: null,
    };

    const aiSkipReason: DeterministicQualificationSkipReason =
      qualification.aiSkipReason;
    const allExcluded =
      qualification.bucket === "EXCLUDED" &&
      qualification.personaMatchStatus === "EXCLUDED";
    const exclusionDetails = buildExclusionDetails({
      criterionAssessments,
      icpCriteria: input.icp.criteria ?? [],
      personaExclusionAssessments,
    });

    await prisma.contactScore.update({
      where: { id: scoreRow.id },
      data: {
        scoringStatus: "COMPLETED",
        overallScore: null,
        icpScore: null,
        personaScore: null,
        companyScore: null,
        productRelevanceScore: null,
        scoreLabel: allExcluded ? "DISQUALIFIED" : null,
        fitStrengths: [],
        fitRisks:
          qualification.bucket === "NEEDS_REVIEW" ? [qualification.reason] : [],
        disqualifiers: allExcluded
          ? personaExclusionAssessments
              .filter((row) => row.outcome === "CONFIRMED")
              .map((row) => ({
                criterion: row.criterion,
                evidence: row.evidence,
                confidence: row.confidence,
                scope: "PERSONA",
              }))
          : [],
        reasoning: qualification.reason,
        recommendedAction: recommendedActionForBucket(
          qualification.bucket,
          qualification.reason,
        ),
        ...companyFields,
        assessmentData: jsonValue({
          dimensions: [],
          unknownDimensionCount: 0,
          disqualifiers: [],
          criterionAssessments,
          icpQualification,
          personaAssessments: assessments,
          personaMatch: {
            status: qualification.personaMatchStatus,
            matchedPersonaId: qualification.matchedPersonaId,
          },
          qualificationBucket: qualification.bucket,
          qualificationReason: qualification.reason,
          aiSkipped: true,
          aiSkipReason,
          targetedSearchOutcomes: criterionAssessments
            .filter((row) => row.evidenceClass === "TARGETED_SEARCH")
            .map((row) => ({
              name: row.name,
              criterionId: row.criterionId ?? null,
              evidenceOutcome: row.evidenceOutcome,
              reasoning: row.reasoning,
            })),
          personaExclusionAssessments,
          exclusionDetails,
        }),
        matchedPersonaId: qualification.matchedPersonaId,
        matchedPersonaSnapshot: matchedPersona
          ? jsonValue(matchedPersona)
          : undefined,
        aiProvider: null,
        aiModel: null,
        aiModelUrlIdentifier: null,
        promptVersion: null,
      },
    });

    const user = await getCurrentUser();
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "CONTACT_SCORING",
      companyId: company?.id ?? null,
      contactId: contact.id,
      scoringRunId: input.scoringRunId,
      status: "SUCCESS",
      metadata: {
        aiSkipped: true,
        reason: aiSkipReason,
        qualificationBucket: qualification.bucket,
        personaCount: personas.length,
        aiCalls: 0,
        matchedPersonaId: qualification.matchedPersonaId,
      },
    });

    return {
      contactScoreId: scoreRow.id,
      contactId: contact.id,
      ok: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scoring failure.";

    await prisma.contactScore.update({
      where: { id: scoreRow.id },
      data: {
        scoringStatus: "FAILED",
        scoringError: message.slice(0, 2000),
      },
    });

    const user = await getCurrentUser();
    await recordUsageEvent({
      organizationId: input.organizationId,
      userId: user?.id ?? null,
      category: "SCORING",
      operation: "CONTACT_SCORING",
      contactId: scoreRow.contactId,
      scoringRunId: input.scoringRunId,
      status: "FAILED",
      metadata: { error: message.slice(0, 500) },
    });

    return {
      contactScoreId: scoreRow.id,
      contactId: scoreRow.contactId,
      ok: false,
      error: message,
    };
  }
}
