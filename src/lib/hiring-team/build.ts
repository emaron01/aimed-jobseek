import { Prisma } from "@prisma/client";
import type { HiringTeamJobEvidence, HiringTeamResearchEvidence } from "@/lib/hiring-team/evidence";
import { hiringTeamEvidenceExcerpts } from "@/lib/hiring-team/evidence";
import { draftRoleWithModel, identifyRolesWithModel } from "@/lib/hiring-team/ai";
import {
  acceptModelRoles,
  differentiateNarratives,
  draftHiringTeamRole,
  evidenceTextFor,
  identifyHiringTeamRoles,
  mergeIdentifiedRoles,
  narrativeLists,
  type AnnotatedText,
  type HiringTeamNarrative,
  type IdentifiedHiringRole,
} from "@/lib/hiring-team/identify";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { prisma } from "@/lib/prisma";
import { vocab } from "@/lib/product-config";
import type { JobScorecard, ScorecardItem } from "@/lib/job-requirement/types";
import { parseStringArray } from "@/lib/research";
import { TenantError } from "@/lib/tenant/errors";

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

function seekerEdited(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function profilePayload(input: {
  includeResearch: boolean;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
  role: IdentifiedHiringRole;
  narrative: HiringTeamNarrative;
  modelNote: string | null;
}): Prisma.InputJsonValue {
  return {
    includeResearch: input.includeResearch,
    roleKey: input.role.roleKey,
    involvement: input.role.involvement,
    evidence: input.excerpts.map((excerpt) => ({
      sourceId: excerpt.sourceId,
      displayName: excerpt.displayName,
      text: excerpt.text,
    })),
    identification: input.role,
    narrative: input.narrative,
    modelNote: input.modelNote,
  } as unknown as Prisma.InputJsonValue;
}

async function loadApplication(organizationId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { id: true, productId: true },
  });
  if (!campaign) {
    throw new TenantError(
      `${vocab.campaign.Singular} was not found for this ${vocab.persona.nav}.`,
    );
  }
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId: campaign.id, organizationId },
    include: {
      company: {
        include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!requirement) return { campaign, requirement: null, job: null, research: null, includeResearch: false };
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
  return { campaign, requirement, job, research, includeResearch };
}

async function identifiedRoles(input: {
  job: HiringTeamJobEvidence;
  research: HiringTeamResearchEvidence | null;
  includeResearch: boolean;
}): Promise<{ roles: IdentifiedHiringRole[]; modelNote: string | null }> {
  const fromEvidence = identifyHiringTeamRoles(input);
  const excerpts = hiringTeamEvidenceExcerpts(input);
  const model = await identifyRolesWithModel({ evidence: excerpts });
  if (!model.ok) {
    return {
      roles: fromEvidence,
      modelNote: model.message.includes("not configured") ? null : model.message,
    };
  }
  const accepted = acceptModelRoles({
    roles: model.data.roles,
    evidenceText: evidenceTextFor(input),
    reportingLine: input.job.reportingLine,
  });
  return {
    roles: mergeIdentifiedRoles(fromEvidence, accepted),
    modelNote: null,
  };
}

async function narrativesFor(input: {
  roles: IdentifiedHiringRole[];
  job: HiringTeamJobEvidence;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
}): Promise<{ narratives: HiringTeamNarrative[]; modelNote: string | null }> {
  const drafted = input.roles.map((role) => draftHiringTeamRole(role, input.job));
  const peers: PersonaDifferentiationInput[] = [];
  let modelNote: string | null = null;
  const withModel: HiringTeamNarrative[] = [];
  for (let index = 0; index < input.roles.length; index += 1) {
    const role = input.roles[index]!;
    const base = drafted[index]!;
    const model = await draftRoleWithModel({
      roleName: role.name,
      likelyTitles: role.likelyTitles,
      department: role.department,
      whyThisRoleMatters: role.whyInvolved,
      involvement: role.involvement,
      notes: null,
      excerpts: input.excerpts,
      peers,
    });
    const narrative = model.ok ? applyModelDraft(base, model.draft, role) : base;
    if (!model.ok && !model.message.includes("not configured")) {
      modelNote = model.message;
    }
    withModel.push(narrative);
    const lists = narrativeLists(narrative);
    peers.push({
      id: role.roleKey,
      name: role.name,
      painPoints: lists.painPoints,
      messagingNotes: lists.messagingNotes,
    });
  }
  return {
    narratives: differentiateNarratives({ roles: input.roles, narratives: withModel }),
    modelNote,
  };
}

function applyModelDraft(
  base: HiringTeamNarrative,
  draft: {
    roleSummary?: string | null;
    impact?: string | null;
    talkingPoints?: string[];
    needsFromHire?: string[];
    candidateConcerns?: string[];
    interviewStage?: string | null;
    evaluates?: string[];
    communicationApproach?: string[];
    primaryResponsibilities?: string[];
  },
  role: IdentifiedHiringRole,
): HiringTeamNarrative {
  const texts = (values: string[] | undefined, fallback: AnnotatedText[]) => {
    const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
    if (cleaned.length === 0) return fallback;
    return cleaned.map((text) => ({ text, kind: "INFERENCE" as const }));
  };
  const stage =
    role.involvement === "DIRECT"
      ? draft.interviewStage?.trim()
        ? { text: draft.interviewStage.trim(), kind: "INFERENCE" as const }
        : base.interviewStage
      : null;
  return {
    overview: {
      text: draft.roleSummary?.trim() || base.overview.text,
      kind: base.overview.kind,
    },
    impact: {
      text: draft.impact?.trim() || base.impact.text,
      kind: "INFERENCE",
    },
    needs: texts(draft.needsFromHire, base.needs),
    concerns: texts(draft.candidateConcerns, base.concerns),
    interviewStage: stage,
    evaluates: texts(draft.evaluates, base.evaluates),
    talkingPoints: texts(draft.talkingPoints, base.talkingPoints),
    communication: texts(draft.communicationApproach, base.communication),
  };
}

function personaFields(role: IdentifiedHiringRole, narrative: HiringTeamNarrative) {
  const lists = narrativeLists(narrative);
  return {
    name: role.name,
    targetTitles: role.likelyTitles,
    department: role.department,
    whyThisPersonaMatters: role.whyInvolved,
    definition: narrative.overview.text,
    responsibilities: joined(narrative.needs.map((item) => item.text)),
    painPoints: joined(lists.painPoints),
    desiredOutcomes: joined(narrative.needs.map((item) => item.text)),
    messagingNotes: joined(lists.messagingNotes),
    suggestionKey: role.roleKey,
    interpretationPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
    setupStatus: "NEEDS_REVIEW" as const,
    approvalStatus: "NEEDS_REVIEW" as const,
  };
}

export async function syncApplicationHiringTeam(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) return;
  const { roles, modelNote } = await identifiedRoles({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const { narratives, modelNote: draftNote } = await narrativesFor({
    roles,
    job: loaded.job,
    excerpts,
  });
  const note = draftNote ?? modelNote;
  for (let index = 0; index < roles.length; index += 1) {
    const role = roles[index]!;
    const narrative = narratives[index]!;
    const existing = await prisma.persona.findFirst({
      where: {
        organizationId: input.organizationId,
        campaignId: loaded.campaign.id,
        suggestionKey: role.roleKey,
        archivedAt: null,
      },
    });
    if (existing && seekerEdited(existing.manuallyEditedFields)) continue;
    const fields = personaFields(role, narrative);
    const profileJson = profilePayload({
      includeResearch: loaded.includeResearch,
      excerpts,
      role,
      narrative,
      modelNote: note,
    });
    if (existing) {
      await prisma.persona.update({
        where: { id: existing.id },
        data: { ...fields, profileJson },
      });
    } else {
      await prisma.persona.create({
        data: {
          organizationId: input.organizationId,
          productId: loaded.campaign.productId,
          campaignId: loaded.campaign.id,
          ...fields,
          profileJson,
        },
      });
    }
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
      setupStatus: "NEEDS_REVIEW",
      approvalStatus: "NEEDS_REVIEW",
      manuallyEditedFields: ["seeker"],
    },
    select: { id: true },
  });
  return { personaId: created.id };
}

export async function updateApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  name: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  notes: string | null;
}): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new TenantError(`${vocab.persona.Singular} name is required.`);
  const persona = await requireRole(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      name,
      targetTitles: input.likelyTitles,
      department: input.department,
      whyThisPersonaMatters: input.whyThisRoleMatters,
      additionalContext: input.notes,
      manuallyEditedFields: ["seeker"],
      approvalStatus: "NEEDS_REVIEW",
      setupStatus: "NEEDS_REVIEW",
    },
  });
}

export async function approveApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<void> {
  const persona = await requireRole(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      approvalStatus: "APPROVED",
      setupStatus: "APPROVED",
      approvedAt: new Date(),
    },
  });
}

export async function rebuildApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<void> {
  const persona = await requireRole(input);
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) {
    throw new TenantError(
      `This ${vocab.campaign.singular} has no job requirement to rebuild from.`,
    );
  }
  const { roles } = await identifiedRoles({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const role =
    roles.find((item) => item.roleKey === persona.suggestionKey) ??
    roles.find((item) => item.name === persona.name) ?? {
      roleKey: persona.suggestionKey ?? `custom_${persona.id}`,
      name: persona.name,
      likelyTitles: parseStringArray(persona.targetTitles),
      department: persona.department,
      involvement: "DIRECT" as const,
      whyInvolved: persona.whyThisPersonaMatters ?? persona.name,
      evidence: [
        {
          claim: persona.whyThisPersonaMatters ?? persona.name,
          kind: "INFERENCE" as const,
          sourceId: "job-requirement",
        },
      ],
    };
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const peers = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
      id: { not: persona.id },
    },
    select: { id: true, name: true, painPoints: true, messagingNotes: true },
  });
  const base = draftHiringTeamRole(role, loaded.job);
  const model = await draftRoleWithModel({
    roleName: role.name,
    likelyTitles: role.likelyTitles,
    department: role.department,
    whyThisRoleMatters: role.whyInvolved,
    involvement: role.involvement,
    notes: persona.additionalContext,
    excerpts,
    peers: peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      painPoints: parsePersonaListField(peer.painPoints),
      messagingNotes: parsePersonaListField(peer.messagingNotes),
    })),
  });
  const narrative = model.ok ? applyModelDraft(base, model.draft, role) : base;
  const fields = personaFields(role, narrative);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      ...fields,
      suggestionKey: persona.suggestionKey ?? role.roleKey,
      manuallyEditedFields: [],
      additionalContext: model.ok ? persona.additionalContext : model.message,
      profileJson: profilePayload({
        includeResearch: loaded.includeResearch,
        excerpts,
        role,
        narrative,
        modelNote: model.ok ? null : model.message.includes("not configured") ? null : model.message,
      }),
    },
  });
}

export async function addTemplateToApplication(input: {
  organizationId: string;
  campaignId: string;
  templateId: string;
}): Promise<{ personaId: string }> {
  const template = await prisma.personaTemplate.findFirst({
    where: { id: input.templateId, organizationId: input.organizationId },
  });
  if (!template) throw new TenantError("That template was not found.");
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
      personaTemplateId: template.id,
      name: template.name,
      targetTitles: template.likelyTitles ?? [],
      department: template.department,
      whyThisPersonaMatters: template.whyThisRoleMatters,
      additionalContext: template.notes,
      setupStatus: "NEEDS_REVIEW",
      approvalStatus: "NEEDS_REVIEW",
      manuallyEditedFields: ["seeker"],
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
  const persona = await requireRole(input);
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

async function requireRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}) {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  if (!persona) {
    throw new TenantError(
      `${vocab.persona.Singular} was not found on this ${vocab.campaign.singular}.`,
    );
  }
  return persona;
}
