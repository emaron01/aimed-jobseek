/**
 * Compare gpt-5.6-terra and gpt-5.6-luna on one application's stored inputs.
 * Read-only: no UsageEvent, receipt, job, or other database write.
 *
 * Render web service shell (env vars are already set; do not pass a dotenv file):
 *   tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId> [--steps planning,questions,cheatsheet,research] [--dry-run]
 */
import {
  parseComparisonSteps,
  RENDER_SHELL_COMMAND,
  runModelComparison,
} from "@/lib/model-comparison/compare";

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} needs a value.`);
  }
  return value;
}

async function main(): Promise<void> {
  const campaignId = flagValue("--campaign")?.trim();
  if (!campaignId) {
    throw new Error(
      `Missing --campaign. ${RENDER_SHELL_COMMAND}`,
    );
  }
  const report = await runModelComparison({
    campaignId,
    steps: parseComparisonSteps(flagValue("--steps")),
    dryRun: process.argv.includes("--dry-run"),
    writeReport: true,
  });
  process.stdout.write(report.markdown);
  if (report.reportPath) {
    process.stderr.write(`\nWrote ${report.reportPath}\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Comparison failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
