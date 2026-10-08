import { getApplicationWorkspaceLive } from "@/lib/application-jobs/workspace-status";
import { getApplicationResearchStatus } from "@/lib/application/research-status";
import {
  applicationProgressLine,
  buildApplicationStepViews,
  initialWorkspaceSeen,
  type ApplicationProgressLabels,
  migrateWorkspaceSeen,
  parseWorkspaceSeenJson,
  serializeWorkspaceSeen,
  type ApplicationStepFactInput,
  type ApplicationStepView,
} from "@/lib/application/step-progress";
import { isHiringTeamPersonaBuilt, hiringTeamInvolvement } from "@/lib/hiring-team/build";
import { JOB_REQUIREMENT_PROCESSING_VERSION } from "@/lib/job-requirement/types";
import { askedQuestionsFromTurns } from "@/lib/consultation/questions";
import { personSectionNeedsGeneration } from "@/lib/application-summary/people";
import { prisma } from "@/lib/prisma-client";
import {
  applicationStepFromPathname,
  type ApplicationStepKey,
} from "@/lib/product-config/application-steps";

export type ApplicationTrackerView = {
  campaignId: string;
  campaignName: string;
  currentStep: ApplicationStepKey | "overview" | null;
  steps: ApplicationStepView[];
};

export async function loadApplicationStepFacts(input: {
  organizationId: string;
  campaignId: string;
}): Promise<ApplicationStepFactInput | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: {
      appliedAt: true,
      hiringTeamRoles: {
        where: { archivedAt: null },
        select: { id: true, setupStatus: true, profileJson: true },
      },
      applicationAssets: {
        where: {
          type: {
            in: [
              "RESUME",
              "COVER_LETTER",
              "EMAIL",
              "LINKEDIN_CONNECTION_NOTE",
              "LINKEDIN_INMAIL",
            ],
          },
        },
        select: {
          type: true,
          status: true,
          version: true,
          createdAt: true,
          contactId: true,
        },
        orderBy: { createdAt: "desc" },
      },
      contacts: {
        select: {
          contactId: true,
          contact: { select: { firstName: true, lastName: true } },
        },
      },
        interviewStages: {
          select: {
            id: true,
            scheduledAt: true,
            interviewers: { select: { contactId: true } },
          },
        },
        applicationSummary: { select: { status: true, guidanceJson: true } },
      consultationSession: {
        select: {
          id: true,
          assessments: {
            select: { targetKey: true, kind: true, text: true, strength: true },
          },
          turns: {
            select: {
              id: true,
              speaker: true,
              body: true,
              targetKey: true,
              followUp: true,
              skipped: true,
              sequence: true,
              intent: true,
              analysisJson: true,
            },
            orderBy: { sequence: "asc" },
          },
          statements: {
            select: {
              id: true,
              turnId: true,
              kind: true,
              status: true,
              content: true,
              strengtheningNote: true,
              createdAt: true,
            },
          },
        },
      },
      jobRequirement: {
        select: {
          title: true,
          parserPromptVersion: true,
        },
      },
    },
  });
  if (!campaign) return null;
  const research = await getApplicationResearchStatus({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  const resumes = campaign.applicationAssets.filter((asset) => asset.type === "RESUME");
  const covers = campaign.applicationAssets.filter(
    (asset) => asset.type === "COVER_LETTER",
  );
  const outreachAssets = campaign.applicationAssets.filter(
    (asset) =>
      asset.type === "EMAIL" ||
      asset.type === "LINKEDIN_CONNECTION_NOTE" ||
      asset.type === "LINKEDIN_INMAIL",
  );
  const latestResume = resumes[0] ?? null;
  const latestCover = covers[0] ?? null;
  const latestAsset =
    !latestResume && !latestCover
      ? null
      : !latestCover
        ? latestResume
        : !latestResume
          ? latestCover
          : latestCover.createdAt >= latestResume.createdAt
            ? latestCover
            : latestResume;
  const latestOutreach = outreachAssets[0] ?? null;
  const outreachContact = latestOutreach?.contactId
    ? campaign.contacts.find((row) => row.contactId === latestOutreach.contactId)
    : campaign.contacts[0] ?? null;
  const outreachName = [outreachContact?.contact.firstName, outreachContact?.contact.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const consultation = consultationFacts(campaign.consultationSession);
  const missingGuides = interviewersMissingPrepGuides({
    stages: campaign.interviewStages.map((stage) => ({
      id: stage.id,
      scheduledAt: stage.scheduledAt,
      interviewerContactIds: stage.interviewers.map((row) => row.contactId),
    })),
    guidanceJson: campaign.applicationSummary?.guidanceJson ?? null,
  });
  return {
    researchDone: research.phase === "done",
    researchFailed: research.phase === "failed",
    researchInProgress:
      research.phase === "queued" || research.phase === "researching",
    hasJobTitle: Boolean(campaign.jobRequirement?.title?.trim()),
    jobReprocessing:
      campaign.jobRequirement?.parserPromptVersion ===
      JOB_REQUIREMENT_PROCESSING_VERSION,
    hiringTeamRoleCount: campaign.hiringTeamRoles.filter(
      (role) => hiringTeamInvolvement(role.profileJson) === "DIRECT",
    ).length,
    hiringTeamBuiltCount: campaign.hiringTeamRoles.filter(
      (role) =>
        hiringTeamInvolvement(role.profileJson) === "DIRECT" &&
        isHiringTeamPersonaBuilt(role),
    ).length,
    hasResumeVersion: resumes.length > 0,
    latestResumeApproved: latestResume?.status === "APPROVED",
    hasUnapprovedAssetDraft:
      (latestResume != null && latestResume.status !== "APPROVED") ||
      (latestCover != null && latestCover.status !== "APPROVED"),
    latestResumeVersion: latestResume?.version ?? null,
    latestCoverLetterVersion: latestCover?.version ?? null,
    latestAssetKind:
      latestAsset?.type === "COVER_LETTER"
        ? "cover"
        : latestAsset?.type === "RESUME"
          ? "resume"
          : null,
    hasApprovedResume: resumes.some((asset) => asset.status === "APPROVED"),
    hasApprovedCoverLetter: covers.some((asset) => asset.status === "APPROVED"),
    contactCount: campaign.contacts.length,
    latestOutreachContactName: outreachName || null,
    outreachMessageCount: outreachAssets.length,
    interviewStageCount: campaign.interviewStages.length,
    cheatSheetReady: campaign.applicationSummary?.status === "READY",
    appliedAt: campaign.appliedAt?.toISOString() ?? null,
    consultationStarted: consultation.started,
    consultationComplete: consultation.complete,
    consultationUnanswered: consultation.unanswered,
    consultationUnansweredCount: consultation.unansweredCount,
    consultationFirstUnansweredTurnId: consultation.firstUnansweredTurnId,
    interviewersWithoutGuideCount: missingGuides.count,
    firstInterviewerWithoutGuideId: missingGuides.firstContactId,
  };
}

export async function getApplicationTracker(input: {
  organizationId: string;
  campaignId: string;
  pathname?: string | null;
}): Promise<ApplicationTrackerView | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, name: true, workspaceSeenJson: true },
  });
  if (!campaign) return null;
  const facts = await loadApplicationStepFacts(input);
  if (!facts) return null;
  const live = await getApplicationWorkspaceLive({
    organizationId: input.organizationId,
    campaignId: input.campaignId,
  });
  const parsed = parseWorkspaceSeenJson(campaign.workspaceSeenJson);
  const seenState =
    campaign.workspaceSeenJson == null
      ? initialWorkspaceSeen(facts)
      : migrateWorkspaceSeen(parsed);
  const shouldPersist =
    campaign.workspaceSeenJson == null ||
    parsed.version !== seenState.version ||
    JSON.stringify(parsed.keys) !== JSON.stringify(seenState.keys);
  if (shouldPersist) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { workspaceSeenJson: serializeWorkspaceSeen(seenState) },
    });
  }
  const currentStep = input.pathname
    ? applicationStepFromPathname(input.pathname)
    : null;
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    currentStep,
    steps: buildApplicationStepViews({
      campaignId: campaign.id,
      currentStep,
      facts,
      jobs: live.jobs,
      seen: seenState.keys,
    }),
  };
}

/** Read-only heading for the application top bar. Does not enqueue work or write seen state. */
export async function getApplicationWorkspaceHeading(input: {
  organizationId: string;
  campaignId: string;
}): Promise<{ title: string; progress: ApplicationProgressLabels | null } | null> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { id: true, name: true },
  });
  if (!campaign) return null;
  const facts = await loadApplicationStepFacts(input);
  if (!facts) return null;
  const live = await getApplicationWorkspaceLive(input);
  const steps = buildApplicationStepViews({
    campaignId: campaign.id,
    currentStep: null,
    facts,
    jobs: live.jobs,
    seen: {},
  });
  const name = campaign.name.trim();
  return {
    title: name ? `${name} Workspace` : "Workspace",
    progress: applicationProgressLine(steps),
  };
}

export async function markApplicationStepViewed(input: {
  organizationId: string;
  campaignId: string;
  stepKey: ApplicationStepKey;
}): Promise<void> {
  const tracker = await getApplicationTracker(input);
  if (!tracker) {
    throw new Error("Application was not found.");
  }
  const step = tracker.steps.find((item) => item.key === input.stepKey);
  if (!step?.resultKey) return;
  const campaign = await prisma.campaign.findFirst({
    where: { id: input.campaignId, organizationId: input.organizationId },
    select: { workspaceSeenJson: true },
  });
  if (!campaign) throw new Error("Application was not found.");
  const facts = await loadApplicationStepFacts(input);
  if (!facts) throw new Error("Application was not found.");
  const seenState = migrateWorkspaceSeen(
    parseWorkspaceSeenJson(campaign.workspaceSeenJson),
  );
  if (seenState.keys[input.stepKey] === step.resultKey) {
    if (seenState.version < 2) {
      await prisma.campaign.update({
        where: { id: input.campaignId },
        data: {
          workspaceSeenJson: serializeWorkspaceSeen({
            ...seenState,
            version: 2,
          }),
        },
      });
    }
    return;
  }
  await prisma.campaign.update({
    where: { id: input.campaignId },
    data: {
      workspaceSeenJson: serializeWorkspaceSeen({
        version: 2,
        keys: { ...seenState.keys, [input.stepKey]: step.resultKey },
      }),
    },
  });
}

/** Harper step facts: green when every asked question is answered; open gaps alone do not block. */
export function consultationFacts(
  session: {
    turns: Array<{
      id: string;
      speaker: "CONSULTANT" | "SEEKER";
      body: string;
      targetKey: string | null;
      followUp: boolean;
      skipped: boolean;
      sequence: number;
      intent: string | null;
      analysisJson: unknown;
    }>;
  } | null,
): {
  started: boolean;
  complete: boolean;
  unanswered: boolean;
  unansweredCount: number;
  firstUnansweredTurnId: string | null;
} {
  if (!session) {
    return {
      started: false,
      complete: false,
      unanswered: false,
      unansweredCount: 0,
      firstUnansweredTurnId: null,
    };
  }
  const asked = askedQuestionsFromTurns(session.turns).filter(
    (question) =>
      Boolean(question.targetKey) || question.text.includes("?"),
  );
  const open = asked.filter(
    (question) => !question.answered && !question.ignored,
  );
  return {
    started: true,
    unanswered: open.length > 0,
    complete: open.length === 0,
    unansweredCount: open.length,
    firstUnansweredTurnId: open[0]?.turnId ?? null,
  };
}

/** Newest interview first, then the first interviewer on that interview who has no ready guide. */
export function interviewersMissingPrepGuides(input: {
  stages: readonly {
    id: string;
    scheduledAt: Date | string | null;
    interviewerContactIds: readonly string[];
  }[];
  guidanceJson: unknown;
}): { count: number; firstContactId: string | null } {
  const ready = readyGuideContactIds(input.guidanceJson);
  const stages = [...input.stages].sort((left, right) => {
    const byTime = timeValue(right.scheduledAt) - timeValue(left.scheduledAt);
    return byTime === 0 ? right.id.localeCompare(left.id) : byTime;
  });
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const stage of stages) {
    for (const contactId of stage.interviewerContactIds) {
      const id = contactId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (!ready.has(id)) missing.push(id);
    }
  }
  return { count: missing.length, firstContactId: missing[0] ?? null };
}

function timeValue(value: Date | string | null): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function readyGuideContactIds(guidanceJson: unknown): Set<string> {
  const people =
    guidanceJson && typeof guidanceJson === "object" && "people" in guidanceJson
      ? (guidanceJson as { people?: unknown }).people
      : null;
  const ready = new Set<string>();
  if (!Array.isArray(people)) return ready;
  for (const person of people) {
    if (!person || typeof person !== "object") continue;
    const contactId = (person as { contactId?: unknown }).contactId;
    if (typeof contactId !== "string" || !contactId.trim()) continue;
    if (
      !personSectionNeedsGeneration(
        person as Parameters<typeof personSectionNeedsGeneration>[0],
      )
    ) {
      ready.add(contactId);
    }
  }
  return ready;
}
