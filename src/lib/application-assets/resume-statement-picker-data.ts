import { Prisma } from "@prisma/client";
import { readResumeBulletCandidates } from "@/lib/application-assets/resume-bullet-candidate-service";
import {
  buildResumeWriterPackage,
  buildStatementGroups,
  resumeStatementPicksFromCampaign,
  workspaceSeenWithoutResumePicks,
  type PickerBullet,
  type RoleBulletPlan,
  type RequiredResumeStatement,
  type StatementGroup,
} from "@/lib/application-assets/resume-statement-picks";
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

export async function loadResumeStatementGroups(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ groups: StatementGroup[]; needsPrepare: boolean }> {
  const [rows, settings] = await Promise.all([
    loadPickerRows(input),
    getHarperDraftSettings(),
  ]);
  if (!rows) return { groups: [], needsPrepare: false };
  return {
    needsPrepare: rows.needsPrepare,
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
