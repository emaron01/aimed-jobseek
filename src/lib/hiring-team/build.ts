import { Prisma } from "@prisma/client";
import type { HiringTeamJobEvidence, HiringTeamResearchEvidence } from "@/lib/hiring-team/evidence";
import { hiringTeamEvidenceExcerpts } from "@/lib/hiring-team/evidence";
import { identifyRolesWithModel, synthesizeHiringTeamRole } from "@/lib/hiring-team/ai";
import {
  jobRequirementLines,
  type HiringTeamNarrative,
} from "@/lib/hiring-team/draft-quality";
import {
  applyHiringTeamIdentificationGuardrails,
  evidenceTextFor,
  type IdentifiedHiringRole,
} from "@/lib/hiring-team/identify";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import { prisma } from "@/lib/prisma-client";
import { hiringTeamConfig, vocab } from "@/lib/product-config";
import { usableEmployerResearch } from "@/lib/job-requirement/identity-verification";
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
  narrative: HiringTeamNarrative | null;
  modelNote: string | null;
  corrections?: Array<{ roleKey: string; reason: string }>;
  dropped?: Array<{ name: string; reason: string }>;
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
    corrections: input.corrections ?? [],
    dropped: input.dropped ?? [],
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
  const confirmedResearch = usableEmployerResearch(requirement, researchRow);
  const includeResearch =
    requirement.employerDisposition === "IDENTIFIED" &&
    confirmedResearch != null &&
    (confirmedResearch.status === "COMPLETED" || confirmedResearch.status === "PARTIAL");
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
  existing?: Array<{ suggestionKey: string | null; name: string; titles: string[] }>;
}): Promise<{
  roles: IdentifiedHiringRole[];
  modelNote: string | null;
  corrections: Array<{ roleKey: string; reason: string }>;
  dropped: Array<{ name: string; reason: string }>;
}> {
  const excerpts = hiringTeamEvidenceExcerpts(input);
  const model = await identifyRolesWithModel({ evidence: excerpts });
  const guarded = applyHiringTeamIdentificationGuardrails({
    roles: model.ok ? model.data.roles : [],
    job: input.job,
    evidenceText: evidenceTextFor(input),
    existing: input.existing,
  });
  const notes = [
    model.ok ? null : model.message,
    ...guarded.corrections.map((item) => item.reason),
    ...guarded.dropped.map((item) => `${item.name}: ${item.reason}`),
  ].filter(Boolean);
  return {
    roles: guarded.roles,
    modelNote: notes.length > 0 ? notes.join(" ") : null,
    corrections: guarded.corrections,
    dropped: guarded.dropped,
  };
}

type RoleDraft = {
  narrative: HiringTeamNarrative | null;
  status: "NEEDS_REVIEW" | "PARTIAL" | "FAILED";
  message: string | null;
};

async function draftsFor(input: {
  roles: IdentifiedHiringRole[];
  job: HiringTeamJobEvidence;
  researchText: string;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
  notesFor?: (role: IdentifiedHiringRole) => string | null;
  peers?: PersonaDifferentiationInput[];
}): Promise<RoleDraft[]> {
  const jobLines = jobRequirementLines(input.job);
  const peers: PersonaDifferentiationInput[] = [...(input.peers ?? [])];
  const drafts: RoleDraft[] = [];
  for (const role of input.roles) {
    const outcome = await synthesizeHiringTeamRole({
      roleName: role.name,
      likelyTitles: role.likelyTitles,
      department: role.department,
      whyThisRoleMatters: role.whyInvolved,
      involvement: role.involvement,
      notes: input.notesFor?.(role) ?? null,
      excerpts: input.excerpts,
      peers,
      jobLines,
      evidenceText: input.researchText,
      isHiringManager: role.roleKey === "hiring_manager",
    });
    if (!outcome.ok) {
      drafts.push({ narrative: null, status: outcome.status, message: outcome.message });
      continue;
    }
    drafts.push({ narrative: outcome.narrative, status: "NEEDS_REVIEW", message: null });
    peers.push({
      id: role.roleKey,
      name: role.name,
      painPoints: [
        ...outcome.narrative.pressures.map((item) => item.text),
        outcome.narrative.impact.text,
        ...outcome.narrative.concerns.map((item) => item.text),
      ],
      messagingNotes: [
        ...outcome.narrative.talkingPoints.map((item) => item.text),
        ...outcome.narrative.communication.map((item) => item.text),
      ],
    });
  }
  return drafts;
}

function personaFields(role: IdentifiedHiringRole, draft: RoleDraft | null) {
  const narrative = draft?.narrative ?? null;
  return {
    name: role.name,
    targetTitles: role.likelyTitles,
    department: role.department,
    whyThisPersonaMatters: role.whyInvolved,
    definition: narrative?.overview.text ?? null,
    responsibilities: narrative ? joined(narrative.needs.map((item) => item.text)) : null,
    painPoints: narrative
      ? joined([
          ...narrative.pressures.map((item) => item.text),
          ...narrative.concerns.map((item) => item.text),
        ])
      : null,
    desiredOutcomes: narrative ? joined(narrative.needs.map((item) => item.text)) : null,
    messagingNotes: narrative
      ? joined([
          ...narrative.talkingPoints.map((item) => item.text),
          ...narrative.communication.map((item) => item.text),
          narrative.interviewStage?.text ?? "",
        ])
      : null,
    suggestionKey: role.roleKey,
    interpretationPromptVersion: PERSONA_SYNTHESIS_PROMPT_VERSION,
    setupStatus: draft?.status ?? ("NOT_STARTED" as const),
    approvalStatus: narrative ? ("NEEDS_REVIEW" as const) : ("NOT_STARTED" as const),
  };
}

export function isHiringTeamPersonaBuilt(persona: {
  setupStatus?: string | null;
  profileJson?: unknown;
}): boolean {
  if (
    persona.setupStatus === "NEEDS_REVIEW" ||
    persona.setupStatus === "APPROVED"
  ) {
    return true;
  }
  if (!persona.profileJson || typeof persona.profileJson !== "object") return false;
  const narrative = (persona.profileJson as { narrative?: unknown }).narrative;
  return Boolean(narrative && typeof narrative === "object");
}

export function hiringTeamInvolvement(profileJson: unknown): "DIRECT" | "INDIRECT" {
  if (!profileJson || typeof profileJson !== "object") return "DIRECT";
  return (profileJson as { involvement?: unknown }).involvement === "INDIRECT"
    ? "INDIRECT"
    : "DIRECT";
}

export async function syncApplicationHiringTeam(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) return;
  const existingRows = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: loaded.campaign.id,
      archivedAt: null,
    },
  });
  const { roles, modelNote, corrections, dropped } = await identifiedRoles({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
    existing: existingRows.map((row) => ({
      suggestionKey: row.suggestionKey,
      name: row.name,
      titles: parseStringArray(row.targetTitles),
    })),
  });
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const seenKeys = new Set<string>();
  for (const role of roles) {
    const existing =
      existingRows.find((row) => row.suggestionKey === role.roleKey) ??
      existingRows.find((row) => row.name === role.name);
    const built = existing ? isHiringTeamPersonaBuilt(existing) : false;
    const existingNarrative =
      existing?.profileJson &&
      typeof existing.profileJson === "object" &&
      (existing.profileJson as { narrative?: HiringTeamNarrative | null }).narrative
        ? (existing.profileJson as { narrative: HiringTeamNarrative }).narrative
        : null;
    const profileJson = profilePayload({
      includeResearch: loaded.includeResearch,
      excerpts,
      role,
      narrative: built ? existingNarrative : null,
      modelNote: modelNote,
      corrections,
      dropped,
    });
    if (existing) {
      seenKeys.add(existing.id);
      const edited = seekerEdited(existing.manuallyEditedFields);
      await prisma.persona.update({
        where: { id: existing.id },
        data: {
          ...(edited
            ? {}
            : {
                name: role.name,
                targetTitles: role.likelyTitles,
                department: role.department,
                whyThisPersonaMatters: role.whyInvolved,
                suggestionKey: role.roleKey,
              }),
          profileJson,
          ...(built
            ? {
                staleAt: new Date(),
                staleReason: hiringTeamConfig.staleReason,
              }
            : {
                setupStatus: "NOT_STARTED",
                approvalStatus: "NOT_STARTED",
                definition: null,
                responsibilities: null,
                painPoints: null,
                desiredOutcomes: null,
                messagingNotes: null,
              }),
        },
      });
      continue;
    }
    const fields = personaFields(role, null);
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
  for (const existing of existingRows) {
    if (seenKeys.has(existing.id)) continue;
    if (seekerEdited(existing.manuallyEditedFields)) continue;
    if (existing.personaTemplateId) continue;
    await prisma.persona.update({
      where: { id: existing.id },
      data: { archivedAt: new Date() },
    });
  }
}

export async function queueHiringTeamIdentify(input: {
  organizationId: string;
  campaignId: string;
  initiatedByUserId?: string | null;
}): Promise<void> {
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "HIRING_TEAM_IDENTIFY",
    initiatedByUserId: input.initiatedByUserId,
  });
}

export async function queueHiringTeamBuild(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  initiatedByUserId?: string | null;
}): Promise<void> {
  const persona = await requireRole(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: { setupStatus: "SYNTHESIZING", staleAt: null, staleReason: null },
  });
  await enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "HIRING_TEAM_BUILD",
    targetId: persona.id,
    initiatedByUserId: input.initiatedByUserId,
  });
}

export async function queueHiringTeamBuildDirect(input: {
  organizationId: string;
  campaignId: string;
  initiatedByUserId?: string | null;
}): Promise<number> {
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  let queued = 0;
  for (const role of roles) {
    if (hiringTeamInvolvement(role.profileJson) !== "DIRECT") continue;
    if (isHiringTeamPersonaBuilt(role) && !role.staleAt) continue;
    await queueHiringTeamBuild({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personaId: role.id,
      initiatedByUserId: input.initiatedByUserId,
    });
    queued += 1;
  }
  return queued;
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
      setupStatus: "NOT_STARTED",
      approvalStatus: "NOT_STARTED",
      profileJson: {
        involvement: "DIRECT",
        identification: {
          roleKey: `custom_${Date.now()}`,
          name,
          likelyTitles: input.likelyTitles,
          department: input.department,
          involvement: "DIRECT",
          whyInvolved: input.whyThisRoleMatters ?? name,
          evidence: [],
        },
        narrative: null,
      },
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
  const existingRows = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
    select: { suggestionKey: true, name: true, targetTitles: true },
  });
  const { roles, corrections, dropped } = await identifiedRoles({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
    existing: existingRows.map((row) => ({
      suggestionKey: row.suggestionKey,
      name: row.name,
      titles: parseStringArray(row.targetTitles),
    })),
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
  const [draft] = await draftsFor({
    roles: [role],
    job: loaded.job,
    researchText: evidenceTextFor({
      job: loaded.job,
      research: loaded.research,
      includeResearch: loaded.includeResearch,
    }),
    excerpts,
    notesFor: () => persona.additionalContext,
    peers: peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      painPoints: parsePersonaListField(peer.painPoints),
      messagingNotes: parsePersonaListField(peer.messagingNotes),
    })),
  });
  if (!draft) {
    throw new TenantError(
      `This ${vocab.persona.singular} could not be drafted. Retry synthesis.`,
    );
  }
  const fields = personaFields(role, draft);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      ...fields,
      suggestionKey: persona.suggestionKey ?? role.roleKey,
      manuallyEditedFields: [],
      staleAt: draft.narrative ? null : persona.staleAt,
      staleReason: draft.narrative ? null : persona.staleReason,
      profileJson: profilePayload({
        includeResearch: loaded.includeResearch,
        excerpts,
        role,
        narrative: draft.narrative,
        modelNote: draft.message,
        corrections,
        dropped,
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
      setupStatus: "NOT_STARTED",
      approvalStatus: "NOT_STARTED",
      profileJson: {
        involvement: "DIRECT",
        identification: {
          roleKey: `template_${template.id}`,
          name: template.name,
          likelyTitles: parseStringArray(template.likelyTitles),
          department: template.department,
          involvement: "DIRECT",
          whyInvolved: template.whyThisRoleMatters ?? template.name,
          evidence: [],
        },
        narrative: null,
      },
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
