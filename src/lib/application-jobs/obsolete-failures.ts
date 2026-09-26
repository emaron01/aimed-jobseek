import { prisma } from "@/lib/prisma-client";
import {
  isObsoleteWorkspaceFailure,
  obsoleteWorkspaceFailurePhrases,
} from "@/lib/product-config";

function obsoleteContainsFilter(field: "error" | "generationError") {
  return obsoleteWorkspaceFailurePhrases.map((phrase) => ({
    [field]: { contains: phrase, mode: "insensitive" as const },
  }));
}

export async function supersedeObsoleteWorkspaceFailures(input?: {
  organizationId?: string;
  campaignId?: string;
}): Promise<{
  jobs: number;
  sessions: number;
  summaries: number;
  guides: number;
}> {
  const scope = {
    ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input?.campaignId ? { campaignId: input.campaignId } : {}),
  };
  const [jobResult, sessions, summaries, guides] = await Promise.all([
    prisma.applicationJob.updateMany({
      where: {
        ...scope,
        status: "FAILED",
        OR: obsoleteContainsFilter("error"),
      },
      data: {
        status: "COMPLETED",
        error: null,
        completedAt: new Date(),
      },
    }),
    prisma.consultationSession.findMany({
      where: {
        ...scope,
        generationError: { not: null },
        OR: obsoleteContainsFilter("generationError"),
      },
      select: { id: true, generationStatus: true, generationError: true },
    }),
    prisma.applicationSummary.findMany({
      where: {
        ...scope,
        generationError: { not: null },
        OR: obsoleteContainsFilter("generationError"),
      },
      select: { id: true, status: true, generationError: true, guidanceJson: true },
    }),
    prisma.interviewStageGuide.findMany({
      where: {
        ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
        generationError: { not: null },
        OR: obsoleteContainsFilter("generationError"),
        ...(input?.campaignId
          ? { stage: { campaignId: input.campaignId } }
          : {}),
      },
      select: { id: true, status: true, generationError: true, contentJson: true },
    }),
  ]);
  let sessionCount = 0;
  for (const session of sessions) {
    if (!isObsoleteWorkspaceFailure(session.generationError)) continue;
    await prisma.consultationSession.update({
      where: { id: session.id },
      data: {
        generationError: null,
        generationStatus:
          session.generationStatus === "FAILED"
            ? "READY"
            : session.generationStatus,
      },
    });
    sessionCount += 1;
  }
  let summaryCount = 0;
  for (const summary of summaries) {
    if (!isObsoleteWorkspaceFailure(summary.generationError)) continue;
    await prisma.applicationSummary.update({
      where: { id: summary.id },
      data: {
        generationError: null,
        status:
          summary.status === "FAILED" && summary.guidanceJson
            ? "READY"
            : summary.status,
      },
    });
    summaryCount += 1;
  }
  let guideCount = 0;
  for (const guide of guides) {
    if (!isObsoleteWorkspaceFailure(guide.generationError)) continue;
    await prisma.interviewStageGuide.update({
      where: { id: guide.id },
      data: {
        generationError: null,
        status:
          guide.status === "FAILED" && guide.contentJson ? "READY" : guide.status,
      },
    });
    guideCount += 1;
  }
  return {
    jobs: jobResult.count,
    sessions: sessionCount,
    summaries: summaryCount,
    guides: guideCount,
  };
}
