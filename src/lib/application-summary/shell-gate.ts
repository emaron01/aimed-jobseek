/**
 * Cheat Sheet shell paid-call fingerprint (Caching Phase 2 batch 1).
 */
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryShellSchema,
} from "@/lib/application-summary/contract";

export const APPLICATION_SUMMARY_SHELL_OPERATION =
  "APPLICATION_SUMMARY_SHELL" as const;
export const APPLICATION_SUMMARY_SHELL_SCHEMA_NAME = "application_summary_shell";

export type ShellSource = {
  id: string;
  text: string;
  category: string;
};

export type ApplicationSummaryShellResult = ReturnType<
  typeof applicationSummaryShellSchema.parse
>;

/** Exact sources the shell model receives, plus prompt and schema version. */
export function applicationSummaryShellFingerprint(
  sources: ShellSource[],
): string {
  return fingerprintPaidCallInputs({
    promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
    schemaName: APPLICATION_SUMMARY_SHELL_SCHEMA_NAME,
    sources: sources.map((source) => ({
      id: source.id,
      text: source.text,
      category: source.category,
    })),
  });
}

export async function runGatedApplicationSummaryShell(input: {
  organizationId: string;
  campaignId: string;
  sources: ShellSource[];
  callProvider: () => Promise<ApplicationSummaryShellResult>;
}): Promise<{ data: ApplicationSummaryShellResult; skipped: boolean }> {
  const fingerprint = applicationSummaryShellFingerprint(input.sources);
  return runPaidStructuredCall<ApplicationSummaryShellResult>({
    organizationId: input.organizationId,
    operation: APPLICATION_SUMMARY_SHELL_OPERATION,
    subjectKey: input.campaignId,
    inputFingerprint: fingerprint,
    parseStored: (json) => applicationSummaryShellSchema.parse(json),
    isResultUsable: (stored) =>
      Boolean(stored?.overview && typeof stored.overview === "object"),
    callProvider: input.callProvider,
  });
}
