import { Prisma } from "@prisma/client";
import { acceptedPresentationPlan } from "@/lib/application-assets/plan-service";
import {
  buildResumeWriterPackage,
  buildStatementGroups,
  pickerProfileFromCandidate,
  resumeStatementPicksFromCampaign,
  workspaceSeenWithoutResumePicks,
  type PickerStatement,
  type RoleBulletPlan,
  type RequiredResumeStatement,
  type StatementGroup,
} from "@/lib/application-assets/resume-statement-picks";
import type { PresentationPlan } from "@/lib/application-assets/plan-contract";
import { getHarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { prisma } from "@/lib/prisma-client";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { TenantError } from "@/lib/tenant/errors";

const PICK_KINDS = ["INTERVIEW_ANSWER", "RESUME_BULLET"] as const;

async function loadPickerRows(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{
  savedPickIds: string[] | null;
  statements: PickerStatement[];
  assessments: Array<{ targetKey: string; text: string; strength: string }>;
  profile: ReturnType<typeof pickerProfileFromCandidate>;
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
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const profile = pickerProfileFromCandidate(
    parsed.ok
      ? parsed.profile
      : { experience: [], education: [], problemsSolved: [] },
  );
  const rows = await prisma.consultationStatement.findMany({
    where: {
      organizationId: input.organizationId,
      status: "APPROVED",
      kind: { in: [...PICK_KINDS] },
      approvedAt: { not: null },
    },
    select: {
      id: true,
      kind: true,
      content: true,
      turn: { select: { targetKey: true } },
    },
    orderBy: { approvedAt: "asc" },
  });
  const statements: PickerStatement[] = rows.flatMap((row) => {
    if (row.kind !== "INTERVIEW_ANSWER" && row.kind !== "RESUME_BULLET") return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        content: row.content,
        targetKey: row.turn?.targetKey ?? null,
      },
    ];
  });
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
    statements,
    assessments: campaign.consultationSession?.assessments ?? [],
    profile,
  };
}

export async function loadResumeStatementGroups(input: {
  organizationId: string;
  campaignId: string;
}): Promise<StatementGroup[]> {
  const [rows, settings, plan] = await Promise.all([
    loadPickerRows(input),
    getHarperDraftSettings(),
    acceptedPresentationPlan({ ...input, type: "RESUME" }),
  ]);
  if (!rows) return [];
  const resumePlan = plan?.type === "RESUME" ? plan : null;
  return buildStatementGroups({
    profile: rows.profile,
    statements: rows.statements,
    assessments: rows.assessments,
    settings,
    savedPickIds: rows.savedPickIds,
    primaryRoleId: resumePlan?.primaryRoleId ?? null,
    directRoleIds: resumePlan?.directRoleIds ?? [],
  });
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
  const resumePlan = input.plan?.type === "RESUME" ? input.plan : null;
  return buildResumeWriterPackage({
    profile: rows.profile,
    statements: rows.statements,
    assessments: rows.assessments,
    settings,
    savedPickIds: rows.savedPickIds,
    primaryRoleId: resumePlan?.primaryRoleId ?? null,
    directRoleIds: resumePlan?.directRoleIds ?? [],
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
  const allowed = requested.length
    ? await prisma.consultationStatement.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: requested },
          status: "APPROVED",
          kind: { in: [...PICK_KINDS] },
        },
        select: { id: true },
      })
    : [];
  const allowedIds = new Set(allowed.map((row) => row.id));
  const picks = requested.filter((id) => allowedIds.has(id));
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: { resumeStatementPicksJson: picks },
  });
}
