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
}): Promise<{ jobs: number; sessions: number }> {
  const scope = {
    ...(input?.organizationId ? { organizationId: input.organizationId } : {}),
    ...(input?.campaignId ? { campaignId: input.campaignId } : {}),
  };
  const [jobResult, sessions] = await Promise.all([
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
  return { jobs: jobResult.count, sessions: sessionCount };
}
