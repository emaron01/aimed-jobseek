/**
 * One seeker-facing failure for the Interview cheat sheet.
 * Jobs are newest first, matching getApplicationWorkspaceLive.
 */
export function latestApplicationSummaryFailure(input: {
  jobs: ReadonlyArray<{
    type: string;
    status: string;
    error: string | null;
    targetId?: string | null;
  }>;
  summaryStatus?: string | null;
  generationError?: string | null;
  fallback: string;
}): { message: string; sectionKey: string | null } | null {
  const latest = input.jobs.find((job) => job.type === "APPLICATION_SUMMARY");
  if (latest?.status === "FAILED") {
    const targetId = latest.targetId?.trim() ?? "";
    return {
      message: latest.error?.trim() || input.fallback,
      sectionKey:
        targetId.startsWith("contact:") || targetId.startsWith("persona:")
          ? targetId
          : null,
    };
  }
  if (input.summaryStatus === "FAILED") {
    return {
      message: input.generationError?.trim() || input.fallback,
      sectionKey: null,
    };
  }
  return null;
}
