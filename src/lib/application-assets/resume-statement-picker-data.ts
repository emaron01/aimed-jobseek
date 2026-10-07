import { Prisma } from "@prisma/client";
import {
  profileWithBulletRoleChoices,
} from "@/lib/application-assets/resume-bullet-candidates";
import { readResumeBulletCandidates } from "@/lib/application-assets/resume-bullet-candidate-service";
import {
  GENERAL_BACKGROUND_ID,
  buildResumeWriterPackage,
  buildStatementGroups,
  resumeStatementPicksFromCampaign,
  roleGroupHeader,
  workspaceSeenWithoutResumePicks,
  type PickerBullet,
  type RoleBulletPlan,
  type RequiredResumeStatement,
  type StatementGroup,
} from "@/lib/application-assets/resume-statement-picks";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import type { PresentationPlan } from "@/lib/application-assets/plan-contract";
import { getHarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { prisma } from "@/lib/prisma-client";
import { TenantError } from "@/lib/tenant/errors";

async function loadPickerRows(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  savedPickIds: string[] | null;
  bullets: PickerBullet[];
  profile: NonNullable<Awaited<ReturnType<typeof readResumeBulletCandidates>>>["packet"]["profile"];
  primaryRoleId: string | null;
  directRoleIds: string[];
  needsPrepare: boolean;
} | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      workspaceSeenJson: true,
      resumeStatementPicksJson: true,
      product: { select: { profileJson: true } },
      consultationSession: {
        select: {
          assessments: {
            select: { targetKey: true, text: true, strength: true },
          },
        },
      },
    },
  });
  if (!campaign) return null;
  const candidates = await readResumeBulletCandidates(input);
  if (!candidates) return null;
  const stored = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: campaign.resumeStatementPicksJson,
    workspaceSeenJson: campaign.workspaceSeenJson,
  });
  if (stored.carryOver) {
    const seen = workspaceSeenWithoutResumePicks(campaign.workspaceSeenJson);
    await prisma.campaign.update({
      where: { id: input.campaignId },
      data: {
        resumeStatementPicksJson: stored.carryOver,
        ...(seen ? { workspaceSeenJson: seen as Prisma.InputJsonValue } : {}),
      },
    });
  }
  return {
    savedPickIds: stored.picks,
    bullets: candidates.bullets,
    profile: candidates.packet.profile,
    primaryRoleId: candidates.packet.primaryRoleId,
    directRoleIds: candidates.packet.directRoleIds,
    needsPrepare: candidates.needsPrepare,
  };
}

export type BulletRoleOption = { roleId: string; label: string };

export async function loadResumeStatementGroups(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ groups: StatementGroup[]; needsPrepare: boolean; roleOptions: BulletRoleOption[] }> {
  const [rows, settings] = await Promise.all([
    loadPickerRows(input),
    getHarperDraftSettings(),
  ]);
  if (!rows) return { groups: [], needsPrepare: false, roleOptions: [] };
  return {
    needsPrepare: rows.needsPrepare,
    roleOptions: rows.profile.experience.map((role) => ({
      roleId: role.id,
      label: roleGroupHeader(role.title?.trim() || "", role.employer?.trim() || ""),
    })),
    groups: buildStatementGroups({
      profile: rows.profile,
      bullets: rows.bullets,
      settings,
      savedPickIds: rows.savedPickIds,
      primaryRoleId: rows.primaryRoleId,
      directRoleIds: rows.directRoleIds,
    }),
  };
}

export async function loadResumeWriterFields(input: {
  organizationId: string;
  campaignId: string;
  plan: PresentationPlan | null;
  planCondensedRoleIds: string[];
  hiddenRoleIds: string[];
}): Promise<{
  requiredStatements: RequiredResumeStatement[];
  roleBulletPlans: RoleBulletPlan[];
  condensedRoleIds: string[];
  backgroundEvidence: string[];
}> {
  const [rows, settings] = await Promise.all([
    loadPickerRows(input),
    getHarperDraftSettings(),
  ]);
  if (!rows) {
    return {
      requiredStatements: [],
      roleBulletPlans: [],
      condensedRoleIds: input.planCondensedRoleIds.filter(
        (id) => !input.hiddenRoleIds.includes(id),
      ),
      backgroundEvidence: [],
    };
  }
  return buildResumeWriterPackage({
    profile: rows.profile,
    bullets: rows.bullets,
    settings,
    savedPickIds: rows.savedPickIds,
    primaryRoleId: rows.primaryRoleId,
    directRoleIds: rows.directRoleIds,
    planCondensedRoleIds: input.planCondensedRoleIds,
    hiddenRoleIds: input.hiddenRoleIds,
  });
}

/** Saves the seeker's job correction on the Personal Profile. Does not call a model. */
export async function saveBulletEvidenceRole(input: {
  organizationId: string;
  campaignId: string;
  evidenceIds: string[];
  roleId: string;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { product: { select: { id: true, profileJson: true } } },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const roleId = input.roleId.trim();
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const allowed = new Set(
    (parsed.ok ? parsed.profile.experience : []).map((role) => role.id),
  );
  if (roleId !== GENERAL_BACKGROUND_ID && !allowed.has(roleId)) {
    throw new TenantError("That job is not on the Personal Profile.");
  }
  const evidenceIds = [...new Set(input.evidenceIds.map((id) => id.trim()).filter(Boolean))];
  if (evidenceIds.length === 0) throw new TenantError("That bullet has no evidence to correct.");
  await prisma.product.update({
    where: { id: campaign.product.id },
    data: {
      profileJson: profileWithBulletRoleChoices(
        campaign.product.profileJson,
        evidenceIds,
        roleId,
      ) as Prisma.InputJsonValue,
    },
  });
}

export async function saveResumeStatementPicks(input: {
  organizationId: string;
  campaignId: string;
  statementIds: string[];
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const requested = [...new Set(input.statementIds.map((id) => id.trim()).filter(Boolean))];
  const stored = await readResumeBulletCandidates(input);
  const allowedIds = new Set((stored?.bullets ?? []).map((bullet) => bullet.id));
  const picks = requested.filter((id) => allowedIds.has(id));
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { resumeStatementPicksJson: picks },
  });
}
