import { Prisma } from "@prisma/client";
import type { HiringTeamJobEvidence, HiringTeamResearchEvidence } from "@/lib/hiring-team/evidence";
import { hiringTeamEvidenceExcerpts } from "@/lib/hiring-team/evidence";
import { identifyRolesWithModel, synthesizeHiringTeamRole } from "@/lib/hiring-team/ai";
import { findPaidCallReceipt } from "@/lib/ai/paid-call-gate";
import {
  jobRequirementLines,
  type HiringTeamNarrative,
} from "@/lib/hiring-team/draft-quality";
import {
  applyHiringTeamIdentificationGuardrails,
  evidenceTextFor,
  sameStoredPersonaName,
  type IdentifiedHiringRole,
} from "@/lib/hiring-team/identify";
import type { PersonaDifferentiationInput } from "@/lib/persona/persona-differentiation";
import { parsePersonaListField } from "@/lib/persona/persona-differentiation";
import {
  excerptsForFingerprint,
  hiringTeamSynthesizeFingerprint,
  peerIdentityFromPersona,
  type HiringTeamPeerIdentity,
} from "@/lib/hiring-team/paid-inputs";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { enqueueApplicationJob } from "@/lib/application-jobs/service";
import type { ApplicationJobPayload } from "@/lib/application-jobs/types";
import { mergeExistingHiringTeamRoles } from "@/lib/hiring-team/merge-existing";
import { prisma } from "@/lib/prisma-client";
import { hiringTeamConfig, vocab } from "@/lib/product-config";
import { loadApplicationEmployerResearch } from "@/lib/application/employer-research-reader";
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
  awaitingSeekerInput?: boolean;
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
    ...(input.awaitingSeekerInput ? { awaitingSeekerInput: true } : {}),
    corrections: input.corrections ?? [],
    dropped: input.dropped ?? [],
  } as unknown as Prisma.InputJsonValue;
}

/** Exported for CHANGE 2 pre-queue fingerprint checks (DB reads only). */
export async function loadHiringTeamEvidenceForCampaign(
  organizationId: string,
  campaignId: string,
) {
  const loaded = await loadApplication(organizationId, campaignId);
  if (!loaded.job) return null;
  return loaded;
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
  const employerResearch = await loadApplicationEmployerResearch({
    organizationId,
    campaignId: campaign.id,
  });
  const includeResearch =
    requirement.employerDisposition === "IDENTIFIED" &&
    employerResearch != null &&
    (employerResearch.status === "COMPLETED" || employerResearch.status === "PARTIAL");
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
  const research: HiringTeamResearchEvidence | null =
    includeResearch && employerResearch
      ? {
          companySummary: employerResearch.companySummary,
          whatTheySell: employerResearch.whatTheySell,
          businessModel: employerResearch.businessModel,
          hiringSignals: employerResearch.hiringSignals,
          riskSignals: employerResearch.riskSignals,
          jobFocus: employerResearch.jobFocus,
          jobFocusDetail: employerResearch.jobFocusDetail,
        }
      : null;
  return { campaign, requirement, job, research, includeResearch };
}

async function identifiedRoles(input: {
  organizationId: string;
  campaignId: string;
  job: HiringTeamJobEvidence;
  research: HiringTeamResearchEvidence | null;
  includeResearch: boolean;
  existing?: Array<{ suggestionKey: string | null; name: string; titles: string[] }>;
}): Promise<{
  roles: IdentifiedHiringRole[];
  modelNote: string | null;
  corrections: Array<{ roleKey: string; reason: string }>;
  dropped: Array<{ name: string; reason: string }>;
  identifySkipped: boolean;
}> {
  const excerpts = hiringTeamEvidenceExcerpts(input);
  const model = await identifyRolesWithModel({
    evidence: excerpts,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "PERSONA_RESEARCH",
      operation: "HIRING_TEAM",
    },
  });
  const guarded = applyHiringTeamIdentificationGuardrails({
    roles: model.ok ? model.data.roles : [],
    job: input.job,
    evidenceText: evidenceTextFor(input),
    existing: input.existing,
  });
  const notes = [
    model.ok ? null : model.message,
    ...guarded.corrections.map((item) => item.reason),
  ].filter(Boolean);
  return {
    roles: guarded.roles,
    modelNote: notes.length > 0 ? notes.join(" ") : null,
    corrections: guarded.corrections,
    dropped: guarded.dropped,
    identifySkipped: model.skipped,
  };
}

type RoleDraft = {
  narrative: HiringTeamNarrative | null;
  status: "NEEDS_REVIEW" | "PARTIAL" | "FAILED" | "AWAITING_DETAILS" | "NOT_STARTED";
  message: string | null;
  awaitingSeekerInput?: boolean;
};

async function draftsFor(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  roles: IdentifiedHiringRole[];
  job: HiringTeamJobEvidence;
  researchText: string;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
  notesFor?: (role: IdentifiedHiringRole) => string | null;
  peers?: PersonaDifferentiationInput[];
  peerIdentities: HiringTeamPeerIdentity[];
}): Promise<{ drafts: RoleDraft[]; synthesizeSkipped: boolean }> {
  const jobLines = jobRequirementLines(input.job);
  const peers: PersonaDifferentiationInput[] = [...(input.peers ?? [])];
  const drafts: RoleDraft[] = [];
  let synthesizeSkipped = false;
  for (const role of input.roles) {
    const outcome = await synthesizeHiringTeamRole({
      organizationId: input.organizationId,
      personaId: input.personaId,
      usage: {
        organizationId: input.organizationId,
        campaignId: input.campaignId,
        category: "PERSONA_RESEARCH",
        operation: "HIRING_TEAM",
      },
      roleName: role.name,
      likelyTitles: role.likelyTitles,
      department: role.department,
      whyThisRoleMatters: role.whyInvolved,
      involvement: role.involvement,
      notes: input.notesFor?.(role) ?? null,
      excerpts: input.excerpts,
      peers,
      peerIdentities: input.peerIdentities,
      jobLines,
      evidenceText: input.researchText,
      isHiringManager: role.roleKey === "hiring_manager",
    });
    if (!outcome.ok) {
      if (
        outcome.status === "AWAITING_DETAILS" ||
        outcome.status === "FAILED" ||
        outcome.status === "PARTIAL"
      ) {
        drafts.push({
          narrative: null,
          status:
            outcome.status === "PARTIAL" ? "PARTIAL" : "AWAITING_DETAILS",
          message: outcome.message,
          awaitingSeekerInput: outcome.status !== "PARTIAL",
        });
        if (outcome.status === "PARTIAL") {
          // Config/unavailable: leave unbuilt without seeker waiting chip from quality path.
          drafts[drafts.length - 1]!.awaitingSeekerInput = false;
        } else {
          drafts[drafts.length - 1]!.awaitingSeekerInput = true;
        }
        continue;
      }
      drafts.push({ narrative: null, status: outcome.status, message: outcome.message });
      continue;
    }
    synthesizeSkipped = synthesizeSkipped || outcome.skipped;
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
  return { drafts, synthesizeSkipped };
}

async function staleAtPatchForBuiltRole(input: {
  organizationId: string;
  personaId: string;
  roleName: string;
  likelyTitles: string[];
  department: string | null;
  whyThisRoleMatters: string | null;
  involvement: "DIRECT" | "INDIRECT";
  notes: string | null;
  excerpts: ReturnType<typeof hiringTeamEvidenceExcerpts>;
  peers: HiringTeamPeerIdentity[];
}): Promise<{ staleAt: Date | null; staleReason: string | null }> {
  const fingerprint = hiringTeamSynthesizeFingerprint({
    roleName: input.roleName,
    likelyTitles: input.likelyTitles,
    department: input.department,
    whyThisRoleMatters: input.whyThisRoleMatters,
    involvement: input.involvement,
    notes: input.notes,
    rejection: [],
    excerpts: excerptsForFingerprint(input.excerpts),
    peers: input.peers,
  });
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: "HIRING_TEAM_SYNTHESIZE",
    subjectKey: input.personaId,
  });
  if (!receipt) {
    return { staleAt: null, staleReason: null };
  }
  if (receipt.inputHash === fingerprint) {
    return { staleAt: null, staleReason: null };
  }
  return {
    staleAt: new Date(),
    staleReason: hiringTeamConfig.staleReason,
  };
}

function personaFields(role: IdentifiedHiringRole, draft: RoleDraft | null) {
  const narrative = draft?.narrative ?? null;
  // AWAITING_DETAILS uses FAILED so the role card keeps the existing Retry action.
  const setupStatus =
    !draft
      ? ("NOT_STARTED" as const)
      : draft.status === "AWAITING_DETAILS" || draft.status === "FAILED"
        ? ("FAILED" as const)
        : draft.status === "NEEDS_REVIEW"
          ? ("NEEDS_REVIEW" as const)
          : draft.status === "PARTIAL"
            ? ("PARTIAL" as const)
            : ("NOT_STARTED" as const);
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
    setupStatus,
    approvalStatus: narrative ? ("NEEDS_REVIEW" as const) : ("NOT_STARTED" as const),
  };
}

export function isHiringTeamPersonaBuilt(persona: {
  setupStatus?: string | null;
  profileJson?: unknown;
}): boolean {
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

export function profileJsonWithInvolvement(
  profileJson: unknown,
  involvement: "DIRECT" | "INDIRECT",
): Prisma.InputJsonValue {
  if (involvement !== "DIRECT" && involvement !== "INDIRECT") {
    throw new TenantError("Choose Direct or Indirect.");
  }
  const current =
    profileJson && typeof profileJson === "object" && !Array.isArray(profileJson)
      ? { ...(profileJson as Record<string, unknown>) }
      : {};
  const identification =
    current.identification &&
    typeof current.identification === "object" &&
    !Array.isArray(current.identification)
      ? {
          ...(current.identification as Record<string, unknown>),
          involvement,
        }
      : current.identification;
  return {
    ...current,
    involvement,
    ...(identification ? { identification } : {}),
  };
}

export async function syncApplicationHiringTeam(input: {
  organizationId: string;
  campaignId: string;
}): Promise<void> {
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) return;
  await mergeExistingHiringTeamRoles({
    organizationId: input.organizationId,
    campaignId: loaded.campaign.id,
  });
  const existingRows = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: loaded.campaign.id,
      archivedAt: null,
    },
  });
  const { roles, modelNote, corrections, dropped } = await identifiedRoles({
    organizationId: input.organizationId,
    campaignId: loaded.campaign.id,
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
  const sameRoleName = (left: string, right: string) =>
    left.trim().toLowerCase() === right.trim().toLowerCase();
  for (const role of roles) {
    const existing = existingRows.find(
      (row) => !seenKeys.has(row.id) && sameRoleName(row.name, role.name),
    );
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
      const peerIdentities = existingRows
        .filter((row) => row.id !== existing.id)
        .map(peerIdentityFromPersona);
      const nextName = existing.name;
      const nextTitles = parseStringArray(existing.targetTitles);
      const nextDepartment = existing.department;
      const nextWhy = existing.whyThisPersonaMatters;
      const nextInvolvement = hiringTeamInvolvement(existing.profileJson);
      const stalePatch = built
        ? await staleAtPatchForBuiltRole({
            organizationId: input.organizationId,
            personaId: existing.id,
            roleName: nextName,
            likelyTitles: nextTitles,
            department: nextDepartment,
            whyThisRoleMatters: nextWhy,
            involvement: nextInvolvement,
            notes: existing.additionalContext,
            excerpts,
            peers: peerIdentities,
          })
        : null;
      await prisma.persona.update({
        where: { id: existing.id },
        data: {
          name: existing.name,
          targetTitles: existing.targetTitles as Prisma.InputJsonValue,
          department: existing.department,
          whyThisPersonaMatters: existing.whyThisPersonaMatters,
          suggestionKey: existing.suggestionKey ?? role.roleKey,
          profileJson,
          ...(built ? stalePatch! : {}),
        },
      });
      continue;
    }
    const nameTaken = existingRows.some((row) => sameStoredPersonaName(row.name, role.name));
    const keyTaken = existingRows.some(
      (row) => Boolean(row.suggestionKey) && row.suggestionKey === role.roleKey,
    );
    if (nameTaken || keyTaken) continue;
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
  deferredOutreach?: ApplicationJobPayload["deferredOutreach"];
  deferCheatSheetSection?: boolean;
}) {
  const { isPersonaAiConfigured } = await import("@/lib/ai");
  if (!isPersonaAiConfigured()) {
    throw new TenantError(
      "Personas can't be built right now. Please try again shortly.",
    );
  }
  const persona = await requireRole(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: { setupStatus: "SYNTHESIZING", staleAt: null, staleReason: null },
  });
  const payload: ApplicationJobPayload = {};
  if (input.initiatedByUserId) payload.userId = input.initiatedByUserId;
  if (input.deferredOutreach) payload.deferredOutreach = input.deferredOutreach;
  if (input.deferCheatSheetSection) payload.deferCheatSheetSection = true;
  return enqueueApplicationJob({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    type: "HIRING_TEAM_BUILD",
    targetId: persona.id,
    initiatedByUserId: input.initiatedByUserId,
    payload: Object.keys(payload).length > 0 ? payload : undefined,
  });
}

export async function queueHiringTeamBuildDirect(input: {
  organizationId: string;
  campaignId: string;
  initiatedByUserId?: string | null;
}): Promise<{ queued: number; jobIds: string[] }> {
  const roles = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  let queued = 0;
  const jobIds: string[] = [];
  for (const role of roles) {
    if (hiringTeamInvolvement(role.profileJson) !== "DIRECT") continue;
    if (isHiringTeamPersonaBuilt(role) && !role.staleAt) continue;
    const job = await queueHiringTeamBuild({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      personaId: role.id,
      initiatedByUserId: input.initiatedByUserId,
    });
    jobIds.push(job.id);
    queued += 1;
  }
  return { queued, jobIds };
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
  const hasNarrative = isHiringTeamPersonaBuilt(persona);
  const { withAwaitingSeekerInput } = await import(
    "@/lib/hiring-team/synthesize-outcome"
  );
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      name,
      targetTitles: input.likelyTitles,
      department: input.department,
      whyThisPersonaMatters: input.whyThisRoleMatters,
      additionalContext: input.notes,
      manuallyEditedFields: ["seeker"],
      // Edits change the synthesize fingerprint; clear waiting-for-details so Generate can run.
      profileJson: withAwaitingSeekerInput(persona.profileJson, false),
      ...(hasNarrative
        ? {
            approvalStatus: "NEEDS_REVIEW" as const,
            setupStatus: "NEEDS_REVIEW" as const,
            staleAt: new Date(),
            staleReason: hiringTeamConfig.staleReason,
          }
        : {
            approvalStatus: "NOT_STARTED" as const,
            setupStatus: "NOT_STARTED" as const,
          }),
    },
  });
}

export async function moveApplicationHiringTeamRoleInvolvement(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  involvement: "DIRECT" | "INDIRECT";
}): Promise<void> {
  if (input.involvement !== "DIRECT" && input.involvement !== "INDIRECT") {
    throw new TenantError("Choose Direct or Indirect.");
  }
  const persona = await requireRole(input);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      profileJson: profileJsonWithInvolvement(
        persona.profileJson,
        input.involvement,
      ),
      manuallyEditedFields: ["seeker"],
    },
  });
}

export type RebuildHiringTeamRoleResult = {
  identifySkipped: boolean;
  synthesizeSkipped: boolean;
};

export async function rebuildApplicationHiringTeamRole(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<RebuildHiringTeamRoleResult> {
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
  });
  const why = persona.whyThisPersonaMatters?.trim() || persona.name;
  const role: IdentifiedHiringRole = {
    roleKey: persona.suggestionKey?.trim() || `custom_${persona.id}`,
    name: persona.name,
    likelyTitles: parseStringArray(persona.targetTitles),
    department: persona.department,
    involvement: hiringTeamInvolvement(persona.profileJson),
    whyInvolved: why,
    evidence: [
      {
        claim: why,
        kind: "INFERENCE",
        sourceId: "job-requirement",
      },
    ],
  };
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const siblingRows = existingRows.filter((row) => row.id !== persona.id);
  const peerIdentities = siblingRows.map(peerIdentityFromPersona);
  const peers = siblingRows.map((peer) => ({
    id: peer.id,
    name: peer.name,
    painPoints: parsePersonaListField(peer.painPoints),
    messagingNotes: parsePersonaListField(peer.messagingNotes),
  }));
  const { drafts, synthesizeSkipped } = await draftsFor({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
    personaId: persona.id,
    roles: [role],
    job: loaded.job,
    researchText: evidenceTextFor({
      job: loaded.job,
      research: loaded.research,
      includeResearch: loaded.includeResearch,
    }),
    excerpts,
    notesFor: () => persona.additionalContext,
    peers,
    peerIdentities,
  });
  const draft = drafts[0];
  if (!draft) {
    throw new TenantError(
      `This ${vocab.persona.singular} could not be drafted. Retry synthesis.`,
    );
  }
  const fields = personaFields(role, draft);
  const edited = seekerEdited(persona.manuallyEditedFields);
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      ...fields,
      name: persona.name,
      targetTitles: persona.targetTitles as Prisma.InputJsonValue,
      department: persona.department,
      whyThisPersonaMatters: persona.whyThisPersonaMatters,
      suggestionKey: persona.suggestionKey,
      ...(edited ? { additionalContext: persona.additionalContext } : {}),
      manuallyEditedFields: edited
        ? (persona.manuallyEditedFields as Prisma.InputJsonValue)
        : [],
      staleAt: draft.narrative ? null : persona.staleAt,
      staleReason: draft.narrative ? null : persona.staleReason,
      profileJson: profilePayload({
        includeResearch: loaded.includeResearch,
        excerpts,
        role,
        narrative: draft.narrative,
        modelNote: draft.message,
        awaitingSeekerInput: Boolean(draft.awaitingSeekerInput),
        corrections: [],
        dropped: [],
      }),
    },
  });
  return { identifySkipped: true, synthesizeSkipped: synthesizeSkipped || !draft.narrative };
}

/** CHANGE 2: DB-only check before queuing Generate/Regenerate. */
export async function hiringTeamSynthesizeUnchanged(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
}): Promise<{
  unchanged: boolean;
  roleName: string;
  awaitingDetails?: boolean;
}> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  if (!persona) {
    return { unchanged: false, roleName: "Persona" };
  }
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) {
    return { unchanged: false, roleName: persona.name };
  }
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const siblings = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
      id: { not: persona.id },
    },
    select: { id: true, name: true, targetTitles: true, profileJson: true },
  });
  const fingerprint = hiringTeamSynthesizeFingerprint({
    roleName: persona.name,
    likelyTitles: parseStringArray(persona.targetTitles),
    department: persona.department,
    whyThisRoleMatters: persona.whyThisPersonaMatters,
    involvement: hiringTeamInvolvement(persona.profileJson),
    notes: persona.additionalContext,
    rejection: [],
    excerpts: excerptsForFingerprint(excerpts),
    peers: siblings.map(peerIdentityFromPersona),
  });
  const { readHiringTeamIncompleteSynthesize } = await import(
    "@/lib/hiring-team/synthesize-outcome"
  );
  const incomplete = await readHiringTeamIncompleteSynthesize({
    organizationId: input.organizationId,
    personaId: persona.id,
    inputFingerprint: fingerprint,
  });
  if (incomplete?.blocksPaidCall) {
    return {
      unchanged: true,
      roleName: persona.name,
      awaitingDetails: true,
    };
  }
  if (!isHiringTeamPersonaBuilt(persona)) {
    return { unchanged: false, roleName: persona.name };
  }
  const receipt = await findPaidCallReceipt({
    organizationId: input.organizationId,
    operation: "HIRING_TEAM_SYNTHESIZE",
    subjectKey: persona.id,
  });
  if (!receipt || receipt.inputHash !== fingerprint) {
    return { unchanged: false, roleName: persona.name };
  }
  return { unchanged: true, roleName: persona.name };
}

export async function markHiringTeamBuildTemporaryExhausted(input: {
  organizationId: string;
  campaignId: string;
  personaId: string;
  message: string;
}): Promise<void> {
  const persona = await prisma.persona.findFirst({
    where: {
      id: input.personaId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
    },
  });
  if (!persona) return;
  const loaded = await loadApplication(input.organizationId, input.campaignId);
  if (!loaded.job) return;
  const excerpts = hiringTeamEvidenceExcerpts({
    job: loaded.job,
    research: loaded.research,
    includeResearch: loaded.includeResearch,
  });
  const siblings = await prisma.persona.findMany({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      archivedAt: null,
      id: { not: persona.id },
    },
    select: { id: true, name: true, targetTitles: true, profileJson: true },
  });
  const fingerprint = hiringTeamSynthesizeFingerprint({
    roleName: persona.name,
    likelyTitles: parseStringArray(persona.targetTitles),
    department: persona.department,
    whyThisRoleMatters: persona.whyThisPersonaMatters,
    involvement: hiringTeamInvolvement(persona.profileJson),
    notes: persona.additionalContext,
    rejection: [],
    excerpts: excerptsForFingerprint(excerpts),
    peers: siblings.map(peerIdentityFromPersona),
  });
  const { recordHiringTeamIncompleteSynthesize, withAwaitingSeekerInput } =
    await import("@/lib/hiring-team/synthesize-outcome");
  await recordHiringTeamIncompleteSynthesize({
    organizationId: input.organizationId,
    personaId: persona.id,
    inputFingerprint: fingerprint,
    kind: "TEMPORARY_EXHAUSTED",
    reasons: [input.message],
  });
  const profile =
    persona.profileJson && typeof persona.profileJson === "object"
      ? { ...(persona.profileJson as Record<string, unknown>), narrative: null }
      : { narrative: null, involvement: "DIRECT" };
  await prisma.persona.update({
    where: { id: persona.id },
    data: {
      setupStatus: "FAILED",
      approvalStatus: "NOT_STARTED",
      definition: null,
      profileJson: withAwaitingSeekerInput(profile, true),
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
