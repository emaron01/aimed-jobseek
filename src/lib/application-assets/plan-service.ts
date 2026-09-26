import type { ApplicationPresentationPlanType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { writePresentationPlanWithModel } from "@/lib/application-assets/plan-ai";
import {
  PRESENTATION_PLAN_PROMPT_VERSION,
  presentationPlanSchema,
  type PresentationPlan,
} from "@/lib/application-assets/plan-contract";
import { prisma } from "@/lib/prisma-client";
import { applicationAssetConfig, vocab } from "@/lib/product-config";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { TenantError } from "@/lib/tenant/errors";

function yearsSinceEnd(endDate: string | null, asOf: Date): number | null {
  if (!endDate) return 0;
  const match = endDate.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const end = Number(match[1]) * 12 + Number(match[2]) - 1;
  const now = asOf.getUTCFullYear() * 12 + asOf.getUTCMonth();
  return Number(((now - end) / 12).toFixed(1));
}

function parsePlan(value: unknown): PresentationPlan {
  return presentationPlanSchema.parse(value);
}

export async function loadPresentationPlan(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationPresentationPlanType;
}) {
  return prisma.applicationPresentationPlan.findFirst({
    where: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
    },
  });
}

export async function writePresentationPlan(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationPresentationPlanType;
  adjustmentNote?: string | null;
}): Promise<{ ok: true; plan: PresentationPlan } | { ok: false; message: string }> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    include: {
      product: { select: { profileJson: true } },
      jobRequirement: { select: { title: true, companyName: true } },
      consultationSession: {
        include: {
          assessments: true,
        },
      },
    },
  });
  if (!campaign) {
    throw new TenantError(`${vocab.campaign.Singular} was not found.`);
  }
  const parsed = campaign.product.profileJson
    ? parseCandidateProfileSafe(campaign.product.profileJson)
    : null;
  if (!parsed?.ok) {
    return {
      ok: false,
      message: `The ${vocab.product.singular} could not be read, so a plan was not written.`,
    };
  }
  const asOf = new Date();
  const stories = await prisma.profileStory.findMany({
    where: { organizationId: input.organizationId, productId: campaign.productId },
    select: { id: true, result: true },
    orderBy: { createdAt: "asc" },
  });
  const written = await writePresentationPlanWithModel({
    type: input.type,
    application: {
      title: campaign.jobRequirement?.title ?? campaign.name,
      employer: campaign.jobRequirement?.companyName ?? null,
    },
    roles: parsed.profile.experience.map((role) => ({
      id: role.id,
      title: role.title,
      employer: role.employer,
      startDate: role.startDate,
      endDate: role.endDate,
      yearsSinceEnd: yearsSinceEnd(role.endDate, asOf),
    })),
    stories: stories.map((story) => ({ id: story.id, result: story.result })),
    assessments: (campaign.consultationSession?.assessments ?? []).map((item) => ({
      text: item.text,
      strength: item.strength,
      explanation: item.explanation ?? "",
    })),
    adjustmentNote: input.adjustmentNote ?? null,
    usage: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      category: "CONSULTATION",
      operation: "CONSULTATION",
    },
  });
  if (!written.ok) return written;
  const roleIds = new Set(parsed.profile.experience.map((role) => role.id));
  if (written.data.type === "RESUME") {
    const resumePlan = written.data;
    const unknown = [
      ...resumePlan.leadingRoleIds,
      ...resumePlan.condensedRoleIds,
    ].filter((id) => !roleIds.has(id));
    if (unknown.length > 0) {
      return {
        ok: false,
        message: `${applicationAssetConfig.labels.planFailed} A recommended role is not in the ${vocab.product.singular}.`,
      };
    }
    if (
      resumePlan.condensedRoleIds.some((id) =>
        resumePlan.leadingRoleIds.includes(id),
      )
    ) {
      return {
        ok: false,
        message: `${applicationAssetConfig.labels.planFailed} A leading role cannot also be condensed.`,
      };
    }
  }
  await prisma.applicationPresentationPlan.upsert({
    where: {
      campaignId_type: { campaignId: input.campaignId, type: input.type },
    },
    create: {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      type: input.type,
      status: "DRAFT",
      planJson: written.data as unknown as Prisma.InputJsonValue,
      adjustmentNote: input.adjustmentNote ?? null,
      promptVersion: PRESENTATION_PLAN_PROMPT_VERSION,
    },
    update: {
      status: "DRAFT",
      planJson: written.data as unknown as Prisma.InputJsonValue,
      adjustmentNote: input.adjustmentNote ?? null,
      promptVersion: PRESENTATION_PLAN_PROMPT_VERSION,
      acceptedAt: null,
    },
  });
  return { ok: true, plan: written.data };
}

export async function acceptPresentationPlan(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationPresentationPlanType;
}): Promise<void> {
  const plan = await loadPresentationPlan(input);
  if (!plan) {
    throw new TenantError("There is no plan to accept.");
  }
  parsePlan(plan.planJson);
  await prisma.applicationPresentationPlan.update({
    where: { id: plan.id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
}

export async function acceptedPresentationPlan(input: {
  organizationId: string;
  campaignId: string;
  type: ApplicationPresentationPlanType;
}): Promise<PresentationPlan | null> {
  const plan = await loadPresentationPlan(input);
  if (!plan || plan.status !== "ACCEPTED") return null;
  return parsePlan(plan.planJson);
}

export function condensedRoleIdsFromPlan(plan: PresentationPlan | null): string[] {
  return plan?.type === "RESUME" ? plan.condensedRoleIds : [];
}

export function earlierExperienceHeadingFromPlan(
  plan: PresentationPlan | null,
): string | null {
  return plan?.type === "RESUME" ? plan.earlierExperienceHeading : null;
}
