import { Prisma } from "@prisma/client";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { getPersonaAiProvider, isPersonaAiConfigured } from "@/lib/ai";
import {
  hiringTeamEvidenceExcerpts,
  likelyTitlesForTemplate,
  type HiringTeamJobEvidence,
  type HiringTeamResearchEvidence,
} from "@/lib/hiring-team/evidence";
import { ensureDefaultPersonaTemplates } from "@/lib/hiring-team/templates";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import {
  PERSONA_SYNTHESIS_PROMPT_VERSION,
  parsePersonaAiResponse,
  type PersonaAiDraft,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";

const AI_UNCONFIGURED =
  "Persona AI is not configured, so this role keeps the template fields only.";

function readScorecard(value: unknown): JobScorecard {
  if (!value || typeof value !== "object") {
    return { mission: null, outcomes: [], competencies: [] };
  }
  const row = value as Partial<JobScorecard>;
  const item = (entry: unknown): ScorecardItem | null => {
    if (!entry || typeof entry !== "object") return null;
    const candidate = entry as Partial<ScorecardItem>;
    if (typeof candidate.text !== "string" || !candidate.text.trim()) return null;
    return {
      id: typeof candidate.id === "string" ? candidate.id : candidate.text,
      text: candidate.text,
      inferred: candidate.inferred === true,
    };
  };
  return {
    mission: item(row.mission),
    outcomes: Array.isArray(row.outcomes)
      ? row.outcomes.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
    competencies: Array.isArray(row.competencies)
      ? row.competencies.map(item).filter((entry): entry is ScorecardItem => Boolean(entry))
      : [],
  };
}

function joined(values: string[]): string | null {
  const text = values.map((value) => value.trim()).filter(Boolean).join("\n");
  return text || null;
}

function titlesFromJson(value: unknown): string[] {
  return parseStringArray(value);
}

function draftMessaging(draft: PersonaAiDraft): string | null {
  return joined([
    ...(draft.communicationApproach ?? []),
    ...draft.messagingNotes,
    draft.interviewStage?.trim()
      ? `Interview stage: ${draft.interviewStage.trim()}`
      : "",
    ...(draft.evaluates ?? []).map((item) => `Evaluates: ${item}`),
  ]);
}

async function synthesizeRole(input: {
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  notes: string | null;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
  peers: PersonaDifferentiationInput[];
}): Promise<PersonaAiDraft> {
  const response = await getPersonaAiProvider().generateStructured({
    ...structuredOutputRequest("personaSynthesis"),
    messages: buildPersonaSynthesisMessages({
      productName: input.roleName,
      productSnapshot: {
        roleName: input.roleName,
        likelyTitles: input.likelyTitles,
        department: input.department,
        whyThisRoleMatters: input.whyThisRoleMatters,
        notes: input.notes,
      },
      productMessaging: null,
      buyerRole: {
        suggestionKey: input.roleName,
        name: input.roleName,
        likelyTitles: input.likelyTitles,
        departmentFunction: input.department,
        whyThisRoleMatters: input.whyThisRoleMatters,
        confidence: "MEDIUM",
        evidenceRefs: [],
      },
      userContext: input.notes ? { notes: input.notes } : null,
      productEvidence: input.excerpts,
      personaEvidence: [],
      icpContext: null,
      existingApprovedPersonas: input.peers,
    }),
    parseOutput: parsePersonaAiResponse,
  });
  return response.data.personaDraft;
}

export async function syncApplicationHiringTeam(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  await ensureDefaultPersonaTemplates(prisma, input.organizationId);
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, productId: true },
  });
  if (!campaign) {
    throw new TenantError(
      `${vocab.campaign.Singular} was not found for this Hiring Team.`,
    );
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: campaign.id, organizationId: input.organizationId },
    include: {
      company: {
        include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!requirement) return;

  const researchRow = requirement.company?.research[0] ?? null;
  const includeResearch =
    requirement.employerDisposition === "IDENTIFIED" &&
    researchRow != null &&
    researchRow.identityAmbiguous !== true &&
    (researchRow.status === "COMPLETED" || researchRow.status === "PARTIAL");
  const job: HiringTeamJobEvidence = {
    title: requirement.title,
    companyName: requirement.companyName,
    location: requirement.location,
    workArrangement: requirement.workArrangement,
    employmentType: requirement.employmentType,
    seniority: requirement.seniority,
    reportingLine: requirement.reportingLine,
    responsibilities: parseStringArray(requirement.responsibilities),
    requiredItems: parseStringArray(requirement.requiredItems),
    preferredItems: parseStringArray(requirement.preferredItems),
    scorecard: readScorecard(requirement.scorecardJson),
  };
  const research: HiringTeamResearchEvidence | null = researchRow
    ? {
        companySummary: researchRow.companySummary,
        whatTheySell: researchRow.whatTheySell,
        businessModel: researchRow.businessModel,
        hiringSignals: parseStringArray(researchRow.hiringSignals),
        riskSignals: parseStringArray(researchRow.riskSignals),
      }
    : null;
  const excerpts = hiringTeamEvidenceExcerpts({
    job,
    research,
    includeResearch,
  });

  const templates = await prisma.personaTemplate.findMany({
    where: { organizationId: input.organizationId },
    orderBy: { createdAt: "asc" },
  });
  const peers: PersonaDifferentiationInput[] = [];

  for (const template of templates) {
    const titles = likelyTitlesForTemplate({
      templateKey: template.templateKey,
      likelyTitles: titlesFromJson(template.likelyTitles),
      reportingLine: requirement.reportingLine,
    });
    const existing = await prisma.persona.findFirst({
      where: {
        organizationId: input.organizationId,
        campaignId: campaign.id,
        personaTemplateId: template.id,
        archivedAt: null,
      },
    });
    const base = {
      name: template.name,
      targetTitles: titles,
      department: template.department,
      whyThisPersonaMatters: template.whyThisRoleMatters,
      additionalContext: template.notes,
      interpretationPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
      definition: null as string | null,
      responsibilities: null as string | null,
      painPoints: null as string | null,
      desiredOutcomes: null as string | null,
      messagingNotes: null as string | null,
    };
    let narrative: {
      name?: string;
      targetTitles?: string[];
      department?: string | null;
      whyThisPersonaMatters?: string | null;
      additionalContext?: string | null;
      definition?: string | null;
      responsibilities?: string | null;
      painPoints?: string | null;
      desiredOutcomes?: string | null;
      messagingNotes?: string | null;
      profileJson?: Prisma.InputJsonValue;
      setupStatus: "PARTIAL" | "FAILED" | "APPROVED";
      approvalStatus?: "APPROVED";
    } = {
      setupStatus: "PARTIAL",
      definition: null,
      profileJson: {
        includeResearch,
        evidence: excerpts.map((excerpt) => ({
          sourceId: excerpt.sourceId,
          displayName: excerpt.displayName,
          text: excerpt.text,
        })),
      },
    };
    if (!isPersonaAiConfigured()) {
      narrative = {
        ...narrative,
        additionalContext: [template.notes, AI_UNCONFIGURED].filter(Boolean).join("\n"),
      };
    } else {
      try {
        const draft = await synthesizeRole({
          roleName: template.name,
          likelyTitles: titles,
          department: template.department,
          whyThisRoleMatters: template.whyThisRoleMatters,
          notes: template.notes,
          excerpts,
          peers,
        });
        const keptTitles = likelyTitlesForTemplate({
          templateKey: template.templateKey,
          likelyTitles: draft.likelyTitles.length > 0 ? draft.likelyTitles : titles,
          reportingLine: requirement.reportingLine,
        });
        narrative = {
          name: draft.name.trim() || template.name,
          targetTitles: keptTitles,
          department: draft.departmentFunction ?? template.department,
          definition: draft.roleSummary ?? null,
          responsibilities: joined(draft.primaryResponsibilities),
          painPoints: joined(draft.painPoints),
          desiredOutcomes: joined(draft.desiredOutcomesFromSolution),
          messagingNotes: draftMessaging(draft),
          whyThisPersonaMatters:
            draft.buyingRole ?? template.whyThisRoleMatters,
          additionalContext: template.notes,
          profileJson: {
            includeResearch,
            evidence: excerpts.map((excerpt) => ({
              sourceId: excerpt.sourceId,
              displayName: excerpt.displayName,
              text: excerpt.text,
            })),
            personaDraft: draft,
          } as unknown as Prisma.InputJsonValue,
          setupStatus: "APPROVED",
          approvalStatus: "APPROVED",
        };
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "hiring_team_synthesis_failed",
            campaignId: campaign.id,
            templateId: template.id,
            message: error instanceof Error ? error.message : "unknown",
          }),
        );
        narrative = {
          setupStatus: "FAILED",
          profileJson: {
            includeResearch,
            evidence: excerpts.map((excerpt) => ({
              sourceId: excerpt.sourceId,
              displayName: excerpt.displayName,
              text: excerpt.text,
            })),
          },
          additionalContext: [
            template.notes,
            `This ${vocab.persona.singular} could not be written from the job requirement. Try again after employer research.`,
          ]
            .filter(Boolean)
            .join("\n"),
        };
      }
    }

    const saved = existing
      ? await prisma.persona.update({
          where: { id: existing.id },
          data: { ...base, ...narrative },
        })
      : await prisma.persona.create({
          data: {
            organizationId: input.organizationId,
            productId: campaign.productId,
            campaignId: campaign.id,
            personaTemplateId: template.id,
            name: template.name,
            targetTitles: titles,
            department: template.department,
            whyThisPersonaMatters: template.whyThisRoleMatters,
            additionalContext: template.notes,
            interpretationPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
            ...narrative,
          },
        });
    peers.push({
      id: saved.id,
      name: saved.name,
      painPoints: parsePersonaListField(saved.painPoints),
      messagingNotes: parsePersonaListField(saved.messagingNotes),
    });
  }
}

export async function addApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  name: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  notes: string | null;
}): Promise<{ personaId: string }> {
  const name = input.name.trim();
  if (!name) throw new TenantError(`${vocab.persona.Singular} name is required.`);
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { productId: true },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const created = await prisma.persona.create({
    data: {
      organizationId: input.organizationId,
      productId: campaign.productId,
      campaignId: input.campaignId,
      name,
      targetTitles: input.likelyTitles,
      department: input.department,
      whyThisPersonaMatters: input.whyThisRoleMatters,
      additionalContext: input.notes,
      setupStatus: "APPROVED",
      approvalStatus: "APPROVED",
    },
    select: { id: true },
  });
  return { personaId: created.id };
}

export async function removeApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<void> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError(`${vocab.persona.Singular} was not found on this ${vocab.campaign.singular}.`);
  }
  try {
    await prisma.persona.delete({ where: { id: persona.id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      await prisma.persona.update({
        where: { id: persona.id },
        data: { archivedAt: new Date() },
      });
      return;
    }
    throw error;
  }
}

export async function savePersonaAsTemplate(input: {
  organizationId: string;
  personaId: string;
}): Promise<{ templateId: string }> {
  const persona = await prisma.persona.findFirst({
    where: { id: input.personaId, organizationId: input.organizationId },
  });
  if (!persona) throw new TenantError(`${vocab.persona.Singular} was not found.`);
  const created = await prisma.personaTemplate.create({
    data: {
      organizationId: input.organizationId,
      name: persona.name,
      likelyTitles: persona.targetTitles ?? [],
      department: persona.department,
      whyThisRoleMatters: persona.whyThisPersonaMatters,
      notes: persona.additionalContext,
    },
    select: { id: true },
  });
  return { templateId: created.id };
}
