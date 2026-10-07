import { Prisma } from "@prisma/client";
import {
  bulletResultKey,
  profileWithBulletRoleChoices,
  profileWithBulletTextEdits,
  profileWithSeekerBullet,
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
  seenBulletIds: string[] | null;
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
    seenBulletIds: stored.seen,
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
      seenBulletIds: rows.seenBulletIds,
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
    seenBulletIds: rows.seenBulletIds,
    primaryRoleId: rows.primaryRoleId,
    directRoleIds: rows.directRoleIds,
    planCondensedRoleIds: input.planCondensedRoleIds,
    hiddenRoleIds: input.hiddenRoleIds,
  });
}

/** Saves the seeker's job correction for one bullet. Does not call a model. */
export async function saveBulletEvidenceRole(input: {
  organizationId: string;
  campaignId: string;
  bulletId: string;
  roleId: string;
  /** Checking the bullet confirms the job and keeps it picked. */
  pick?: boolean;
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
  const stored = await readResumeBulletCandidates(input);
  const bullet = stored?.bullets.find((item) => item.id === input.bulletId.trim());
  if (!bullet) throw new TenantError("That bullet has no evidence to correct.");
  const resultKey = bullet.resultKey ?? bulletResultKey(bullet.text, bullet.evidenceIds);
  const storedRole = roleId === GENERAL_BACKGROUND_ID ? null : roleId;
  let profileJson = profileWithBulletRoleChoices(
    campaign.product.profileJson,
    [resultKey],
    roleId,
  );
  profileJson = profileWithSeekerBullet(profileJson, {
    id: bullet.id,
    text: bullet.text,
    roleId: storedRole,
  });
  await prisma.product.update({
    where: { id: campaign.product.id },
    data: { profileJson: profileJson as Prisma.InputJsonValue },
  });
  if (!input.pick) return;
  const campaignPicks = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { resumeStatementPicksJson: true },
  });
  const saved = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: campaignPicks?.resumeStatementPicksJson,
    workspaceSeenJson: null,
  }).picks;
  const alreadyChecked =
    saved ??
    (await loadResumeStatementGroups(input)).groups.flatMap((group) =>
      group.items.filter((item) => item.checked).map((item) => item.id),
    );
  const picks = [...new Set([...alreadyChecked, bullet.id])];
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { resumeStatementPicksJson: picks },
  });
}

/** Saves the seeker's wording for one bullet. Does not call a model. */
export async function saveBulletText(input: {
  organizationId: string;
  campaignId: string;
  bulletId: string;
  text: string;
}): Promise<void> {
  const text = input.text.trim();
  if (!text) throw new TenantError("Write the bullet before saving.");
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { product: { select: { id: true, profileJson: true } } },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const stored = await readResumeBulletCandidates(input);
  const bullet = stored?.bullets.find((item) => item.id === input.bulletId.trim());
  if (!bullet) throw new TenantError("That bullet was not found.");
  const resultKey = bullet.resultKey ?? bulletResultKey(bullet.text, bullet.evidenceIds);
  const profileJson = profileWithSeekerBullet(
    profileWithBulletTextEdits(campaign.product.profileJson, resultKey, text),
    {
      id: bullet.id,
      text,
      roleId: bullet.roleId === GENERAL_BACKGROUND_ID ? null : bullet.roleId,
    },
  );
  await prisma.product.update({
    where: { id: campaign.product.id },
    data: { profileJson: profileJson as Prisma.InputJsonValue },
  });
  const campaignPicks = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { resumeStatementPicksJson: true },
  });
  const saved = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: campaignPicks?.resumeStatementPicksJson,
    workspaceSeenJson: null,
  }).picks;
  if (saved && !saved.includes(bullet.id)) {
    await prisma.campaign.update({
      where: { id: input.campaignId },
      data: { resumeStatementPicksJson: [...saved, bullet.id] },
    });
  }
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
    data: {
      resumeStatementPicksJson: {
        picks,
        seen: [...allowedIds],
      },
    },
  });
}
