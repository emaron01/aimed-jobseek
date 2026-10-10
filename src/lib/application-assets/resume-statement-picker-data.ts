import { Prisma } from "@prisma/client";
import { paidCallResultJson } from "@/lib/ai/paid-call-gate";
import {
  bulletResultKey,
  oneLineBullet,
  profileWithBulletRoleChoices,
  profileWithBulletTextEdits,
  profileWithDismissedBullet,
  profileWithoutSeekerBullet,
  profileWithSeekerBullet,
  textIsDismissed,
} from "@/lib/application-assets/resume-bullet-candidates";
import { readResumeBulletCandidates } from "@/lib/application-assets/resume-bullet-candidate-service";
import {
  GENERAL_BACKGROUND_ID,
  buildResumeWriterPackage,
  buildStatementGroups,
  bulletDisplayId,
  carryProfileHiddenRoles,
  readResumePicksHiddenRoleIds,
  resumePicksWithRoleLeftOff,
  resumeStatementPicksFromCampaign,
  resumeStatementPicksJsonWith,
  roleGroupHeader,
  workspaceSeenWithoutResumePicks,
  type PickerBullet,
  type PickerProfile,
  type RoleBulletPlan,
  type RequiredResumeStatement,
  type StatementGroup,
} from "@/lib/application-assets/resume-statement-picks";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import type { PresentationPlan } from "@/lib/application-assets/plan-contract";
import { getHarperDraftSettings } from "@/lib/consultation/harper-draft-settings";
import { prisma } from "@/lib/prisma-client";
import { TenantError } from "@/lib/tenant/errors";

/** Copies profile-level hides onto applications that already have picker state, then clears the profile field. */
async function persistCarriedHiddenRoles(input: {
  organizationId: string;
  productId: string;
  profileJson: unknown;
}): Promise<Map<string, unknown> | null> {
  const profile =
    input.profileJson && typeof input.profileJson === "object" && !Array.isArray(input.profileJson)
      ? (input.profileJson as Record<string, unknown>)
      : null;
  if (!profile || !Object.prototype.hasOwnProperty.call(profile, "hiddenRoleIds")) return null;
  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: input.organizationId, productId: input.productId },
    select: { id: true, resumeStatementPicksJson: true, workspaceSeenJson: true },
  });
  const carried = carryProfileHiddenRoles({ profileJson: input.profileJson, campaigns });
  if (!carried) return null;
  await prisma.$transaction([
    ...carried.updates.map((update) =>
      prisma.campaign.update({
        where: { id: update.id },
        data: {
          resumeStatementPicksJson: update.resumeStatementPicksJson as Prisma.InputJsonValue,
          ...(update.workspaceSeenJson
            ? { workspaceSeenJson: update.workspaceSeenJson as Prisma.InputJsonValue }
            : {}),
        },
      }),
    ),
    prisma.product.updateMany({
      where: { id: input.productId, organizationId: input.organizationId },
      data: { profileJson: paidCallResultJson(carried.profileJson) },
    }),
  ]);
  return new Map(carried.updates.map((update) => [update.id, update.resumeStatementPicksJson]));
}

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
  hiddenRoleIds: string[];
  dismissedTexts: string[];
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
  const carried = await persistCarriedHiddenRoles({
    organizationId: input.organizationId,
    productId: candidates.packet.productId,
    profileJson: candidates.packet.profileJson,
  });
  const picksJson = carried?.get(input.campaignId) ?? campaign.resumeStatementPicksJson;
  const stored = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: picksJson,
    workspaceSeenJson: campaign.workspaceSeenJson,
  });
  if (stored.carryOver) {
    const seen = workspaceSeenWithoutResumePicks(campaign.workspaceSeenJson);
    await prisma.campaign.update({
      where: { id: input.campaignId },
      data: {
        resumeStatementPicksJson: resumeStatementPicksJsonWith({
          current: picksJson,
          picks: stored.carryOver,
        }) as Prisma.InputJsonValue,
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
    hiddenRoleIds: readResumePicksHiddenRoleIds(picksJson),
    dismissedTexts: candidates.packet.dismissedTexts,
    needsPrepare: candidates.needsPrepare,
  };
}

export type BulletRoleOption = { roleId: string; label: string };

/** Profile achievements the seeker has not removed. The profile itself is unchanged. */
export function profileWithoutDismissedResults(
  profile: PickerProfile,
  dismissed: readonly string[],
): PickerProfile {
  const employers = profile.experience
    .map((role) => role.employer?.trim() ?? "")
    .filter((employer) => employer.length > 0);
  return {
    ...profile,
    experience: profile.experience.map((role) => ({
      ...role,
      achievements: (role.achievements ?? []).filter(
        (text) => !textIsDismissed(text, dismissed, employers),
      ),
    })),
  };
}

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
      profile: profileWithoutDismissedResults(rows.profile, rows.dismissedTexts),
      bullets: rows.bullets,
      settings,
      savedPickIds: rows.savedPickIds,
      seenBulletIds: rows.seenBulletIds,
      primaryRoleId: rows.primaryRoleId,
      directRoleIds: rows.directRoleIds,
      hiddenRoleIds: rows.hiddenRoleIds,
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
    profile: profileWithoutDismissedResults(rows.profile, rows.dismissedTexts),
    bullets: rows.bullets,
    settings,
    savedPickIds: rows.savedPickIds,
    seenBulletIds: rows.seenBulletIds,
    primaryRoleId: rows.primaryRoleId,
    directRoleIds: rows.directRoleIds,
    planCondensedRoleIds: input.planCondensedRoleIds,
    hiddenRoleIds: rows.hiddenRoleIds,
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
    data: { profileJson: paidCallResultJson(profileJson) },
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
  const latest = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { resumeStatementPicksJson: true },
  });
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      resumeStatementPicksJson: resumeStatementPicksJsonWith({
        current: latest?.resumeStatementPicksJson,
        picks,
      }) as Prisma.InputJsonValue,
    },
  });
}

/** The jobs this application left off the resume. Does not call a model. */
export async function hiddenRoleIdsForCampaign(input: {
  organizationId: string;
  campaignId: string;
}): Promise<string[]> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      resumeStatementPicksJson: true,
      product: { select: { id: true, profileJson: true } },
    },
  });
  if (!campaign) return [];
  const carried = await persistCarriedHiddenRoles({
    organizationId: input.organizationId,
    productId: campaign.product.id,
    profileJson: campaign.product.profileJson,
  });
  const picksJson = carried?.get(input.campaignId) ?? campaign.resumeStatementPicksJson;
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const allowed = new Set(
    (parsed.ok ? parsed.profile.experience : []).map((role) => role.id),
  );
  return readResumePicksHiddenRoleIds(picksJson).filter((id) => allowed.has(id));
}

/** Remembers that this application left a job off the resume, or put it back on. Does not call a model. */
export async function saveResumeRoleVisibility(input: {
  organizationId: string;
  campaignId: string;
  roleId: string;
  leftOff: boolean;
}): Promise<void> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      resumeStatementPicksJson: true,
      product: { select: { id: true, profileJson: true } },
    },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const roleId = input.roleId.trim();
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const allowed = new Set(
    (parsed.ok ? parsed.profile.experience : []).map((role) => role.id),
  );
  if (!allowed.has(roleId)) throw new TenantError("That job is not on the Personal Profile.");
  const carried = await persistCarriedHiddenRoles({
    organizationId: input.organizationId,
    productId: campaign.product.id,
    profileJson: campaign.product.profileJson,
  });
  const current = carried?.get(input.campaignId) ?? campaign.resumeStatementPicksJson;
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      resumeStatementPicksJson: resumePicksWithRoleLeftOff(
        current,
        roleId,
        input.leftOff,
      ) as Prisma.InputJsonValue,
    },
  });
}

/** Saves one line the seeker wrote as a seeker bullet for this job. Does not call a model. */
export async function addSeekerBullet(input: {
  organizationId: string;
  campaignId: string;
  roleId: string;
  text: string;
}): Promise<string> {
  const text = oneLineBullet(input.text);
  if (!text) throw new TenantError("Write the bullet before saving.");
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      resumeStatementPicksJson: true,
      product: { select: { id: true, profileJson: true } },
    },
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
  const storedRole = roleId === GENERAL_BACKGROUND_ID ? null : roleId;
  const id = bulletDisplayId(storedRole ?? GENERAL_BACKGROUND_ID, text);
  await prisma.product.update({
    where: { id: campaign.product.id },
    data: {
      profileJson: paidCallResultJson(
        profileWithSeekerBullet(campaign.product.profileJson, {
          id,
          text,
          roleId: storedRole,
        }),
      ),
    },
  });
  const saved = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: campaign.resumeStatementPicksJson,
    workspaceSeenJson: null,
  }).picks;
  const alreadyChecked =
    saved ??
    (await loadResumeStatementGroups(input)).groups.flatMap((group) =>
      group.items.filter((item) => item.checked).map((item) => item.id),
    );
  const latest = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { resumeStatementPicksJson: true },
  });
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      resumeStatementPicksJson: resumeStatementPicksJsonWith({
        current: latest?.resumeStatementPicksJson,
        picks: [...new Set([...alreadyChecked, id])],
      }) as Prisma.InputJsonValue,
    },
  });
  return id;
}

/** Removes one picker bullet. Does not call a model or change the source answer or achievement. */
export async function removePickerBullet(input: {
  organizationId: string;
  campaignId: string;
  bulletId: string;
}): Promise<void> {
  const bulletId = input.bulletId.trim();
  const groups = await loadResumeStatementGroups(input);
  const bullet = groups.groups.flatMap((group) => group.items).find((item) => item.id === bulletId);
  if (!bullet) throw new TenantError("That bullet was not found.");
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      resumeStatementPicksJson: true,
      product: { select: { id: true, profileJson: true } },
    },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const parsed = parseCandidateProfileSafe(campaign.product.profileJson);
  const employers = parsed.ok
    ? parsed.profile.experience.map((role) => role.employer?.trim() ?? "").filter(Boolean)
    : [];
  let profileJson = profileWithDismissedBullet(
    campaign.product.profileJson,
    bullet.content,
    employers,
  );
  if (bullet.seekerOwned) profileJson = profileWithoutSeekerBullet(profileJson, bullet.id);
  await prisma.product.update({
    where: { id: campaign.product.id },
    data: { profileJson: paidCallResultJson(profileJson) },
  });
  const stored = campaign.resumeStatementPicksJson;
  const saved = resumeStatementPicksFromCampaign({
    resumeStatementPicksJson: stored,
    workspaceSeenJson: null,
  }).picks;
  if (saved) {
    await prisma.campaign.update({
      where: { id: input.campaignId },
      data: {
        resumeStatementPicksJson: resumeStatementPicksJsonWith({
          current: stored,
          picks: saved.filter((id) => id !== bullet.id),
        }) as Prisma.InputJsonValue,
      },
    });
  }
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
    data: { profileJson: paidCallResultJson(profileJson) },
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
      data: {
        resumeStatementPicksJson: resumeStatementPicksJsonWith({
          current: campaignPicks?.resumeStatementPicksJson,
          picks: [...saved, bullet.id],
        }) as Prisma.InputJsonValue,
      },
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
    select: { id: true, resumeStatementPicksJson: true },
  });
  if (!campaign) throw new TenantError("Application was not found.");
  const requested = [...new Set(input.statementIds.map((id) => id.trim()).filter(Boolean))];
  const stored = await readResumeBulletCandidates(input);
  const allowedIds = new Set((stored?.bullets ?? []).map((bullet) => bullet.id));
  const picks = requested.filter((id) => allowedIds.has(id));
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      resumeStatementPicksJson: resumeStatementPicksJsonWith({
        current: campaign.resumeStatementPicksJson,
        picks,
        seen: [...allowedIds],
      }) as Prisma.InputJsonValue,
    },
  });
}
