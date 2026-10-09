import "server-only";

import { cache } from "react";
import { loadResumeStatementGroups } from "@/lib/application-assets/resume-statement-picker-data";
import { coverLetterEvidenceIsThin } from "@/lib/application-assets/service";
import { presentationPlanSchema } from "@/lib/application-assets/plan-contract";
import {
  anchorHostFromResearchTimings,
  employerWebsiteAnchor,
} from "@/lib/application/company-website";
import { loadApplicationEmployerResearch } from "@/lib/application/employer-research-reader";
import { displayedFitBucket } from "@/lib/application/fit";
import type { ApplicationFitOutcome } from "@/lib/application/fit";
import { readApplicationNextStep } from "@/lib/application/next-step";
import { getApplicationResearchStatus } from "@/lib/application/research-status";
import {
  ensureIdentityVerification,
  readApplicationFitStale,
} from "@/lib/application/service";
import {
  workspaceProfileEditHref,
  workspaceProfileHref,
} from "@/lib/application/workspace-links";
import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { supersedeObsoleteWorkspaceFailures } from "@/lib/application-jobs/obsolete-failures";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { parseCandidateProfileSafe } from "@/lib/product-research/candidate-profile";
import { persistExtractedContactDetails } from "@/lib/product-research/restore-contact-details";
import { persistExtractedExperienceDates } from "@/lib/product-research/restore-role-dates";
import { getActiveEmailSignatureBody } from "@/lib/signature/signature";

function readOutcomes(value: unknown): ApplicationFitOutcome[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ApplicationFitOutcome => {
    if (!entry || typeof entry !== "object") return false;
    return typeof (entry as { name?: unknown }).name === "string";
  });
}

/**
 * One workspace read for the dashboard and for a step page.
 * React cache dedupes calls in the same request when the arguments match,
 * so an open card does not run this query a second time.
 * This function does not enqueue a job or make a paid call.
 */
export const loadApplicationWorkspaceModel = cache(async function loadApplicationWorkspaceModel(
  organizationId: string,
  campaignId: string,
  canEdit: boolean,
  includeAssets: boolean,
  includeSignature: boolean,
) {
  await ensureIdentityVerification({ organizationId, campaignId });
  const requirement = await prisma.jobRequirement.findFirst({
    where: { campaignId, organizationId },
    include: {
      company: { include: { research: { orderBy: { updatedAt: "desc" }, take: 1 } } },
      campaign: {
        select: {
          companyResearchNotes: true,
          icp: {
            select: { updatedAt: true, interpretationPromptVersion: true, name: true },
          },
          applicationFit: true,
          product: { select: { id: true, profileJson: true } },
          appliedAt: true,
          applicationProgress: true,
          contacts: {
            include: {
              contact: true,
              chosenPersona: {
                select: { id: true, name: true, suggestionKey: true },
              },
            },
            orderBy: { createdAt: "asc" },
          },
          hiringTeamRoles: {
            where: { archivedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              suggestionKey: true,
              setupStatus: true,
              profileJson: true,
            },
          },
          applicationAssets: {
            orderBy: [{ type: "asc" }, { version: "desc" }],
          },
          interviewStages: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              type: true,
              format: true,
              scheduledAt: true,
              notesAfter: true,
              thankYouClarifyJson: true,
              interviewers: {
                take: 1,
                select: { contactId: true },
              },
            },
          },
          presentationPlans: true,
        },
      },
    },
  });
  if (!requirement) {
    return { requirement: null };
  }

  const researchAnchor = employerWebsiteAnchor({
    suppliedEmployerWebsite: requirement.suppliedEmployerWebsite,
    companyWebsite: requirement.company?.website,
    companyDomain: requirement.company?.normalizedDomain,
  });
  const researchStatus = await getApplicationResearchStatus({
    organizationId,
    campaignId,
  });
  const sharedResearch = requirement.company?.research[0] ?? null;
  const employerResearch = await loadApplicationEmployerResearch({
    organizationId,
    campaignId,
  });
  const research = employerResearch ?? sharedResearch;
  const researchAnchored = (() => {
    if (employerResearch?.source === "tailored") return true;
    const stamped = anchorHostFromResearchTimings(
      sharedResearch?.researchStageTimings,
    );
    return Boolean(
      stamped && researchAnchor && stamped === researchAnchor.domain,
    );
  })();
  const fit = requirement.campaign.applicationFit;
  const icp = requirement.campaign.icp;
  const stale = fit
    ? readApplicationFitStale({
        stale: fit.stale,
        staleReason: fit.staleReason,
        computedAt: fit.computedAt,
        icpUpdatedAt: fit.icpUpdatedAt,
        companyResearchUpdatedAt: fit.companyResearchUpdatedAt,
        interpretationPromptVersion: fit.interpretationPromptVersion,
        currentIcpUpdatedAt: icp?.updatedAt ?? null,
        currentResearchUpdatedAt: research?.updatedAt ?? null,
        currentPromptVersion: icp?.interpretationPromptVersion ?? null,
      })
    : null;
  const outcomes = fit ? readOutcomes(fit.outcomesJson) : [];
  let profile = parseCandidateProfileSafe(
    requirement.campaign.product.profileJson,
  );
  if (profile.ok && canEdit) {
    profile = {
      ok: true as const,
      profile: await persistExtractedContactDetails({
        organizationId,
        productId: requirement.campaign.product.id,
        profile: await persistExtractedExperienceDates({
          organizationId,
          productId: requirement.campaign.product.id,
          profile: profile.profile,
        }),
      }),
    };
  }
  const statementPicker = includeAssets
    ? await loadResumeStatementGroups({ organizationId, campaignId })
    : { groups: [], needsPrepare: false, roleOptions: [] };
  const [approvedStatementCount, approvedStoryCount] = await Promise.all([
    prisma.consultationStatement.count({
      where: {
        organizationId,
        session: { campaignId },
        status: "APPROVED",
      },
    }),
    prisma.profileStory.count({
      where: {
        organizationId,
        productId: requirement.campaign.product.id,
      },
    }),
  ]);
  const coverLetterEvidenceThin = coverLetterEvidenceIsThin({
    approvedStatementCount,
    approvedStoryCount,
    achievementTexts: profile.ok
      ? profile.profile.experience.flatMap((role) =>
          role.achievements.map((item) => item.text),
        )
      : [],
  });
  const emailSignature = includeSignature
    ? await getActiveEmailSignatureBody({
        organizationId,
        userId: (await requireCurrentUser()).id,
      })
    : null;
  await supersedeObsoleteWorkspaceFailures({ organizationId, campaignId });
  const [nextStep, live] = await Promise.all([
    readApplicationNextStep({
      organizationId,
      campaignId,
    }),
    getApplicationWorkspaceLive({ organizationId, campaignId }),
  ]);
  const profileHref = workspaceProfileHref(requirement.campaign.product.id);
  const profileEditHref = workspaceProfileEditHref(
    requirement.campaign.product.id,
  );
  const invalidPlanTypes = requirement.campaign.presentationPlans.flatMap(
    (row) =>
      presentationPlanSchema.safeParse(row.planJson).success
        ? []
        : [row.type as "RESUME" | "COVER_LETTER"],
  );
  const presentationPlans = requirement.campaign.presentationPlans.flatMap(
    (row) => {
      const parsed = presentationPlanSchema.safeParse(row.planJson);
      if (!parsed.success) return [];
      return [
        {
          type: row.type as "RESUME" | "COVER_LETTER",
          status: row.status as "DRAFT" | "ACCEPTED",
          plan: parsed.data,
        },
      ];
    },
  );
  const assetsOpen =
    nextStep.stateKey === "resume_plan_ready" ||
    nextStep.stateKey === "cover_plan_ready" ||
    nextStep.stateKey === "resume_ready" ||
    nextStep.stateKey === "cover_ready";
  const shownBucket = fit
    ? displayedFitBucket({
        bucket: fit.bucket,
        overrideBucket: fit.overrideBucket,
      })
    : null;

  return {
    requirement,
    researchAnchor,
    researchStatus,
    employerResearch,
    research,
    researchAnchored,
    fit,
    icp,
    stale,
    outcomes,
    profile,
    statementPicker,
    coverLetterEvidenceThin,
    emailSignature,
    nextStep,
    live,
    profileHref,
    profileEditHref,
    invalidPlanTypes,
    presentationPlans,
    assetsOpen,
    shownBucket,
  };
});

export type ApplicationWorkspaceModel = Awaited<
  ReturnType<typeof loadApplicationWorkspaceModel>
>;

export type LoadedApplicationWorkspace = ApplicationWorkspaceModel & {
  requirement: NonNullable<ApplicationWorkspaceModel["requirement"]>;
};
