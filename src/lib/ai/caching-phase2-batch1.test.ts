/**
 * Caching Phase 2 batch 1: job parse, cheat-sheet shell, know-about-me reassess.
 */
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  fingerprintPaidCallInputs,
  runPaidStructuredCall,
} from "@/lib/ai/paid-call-gate";
import {
  APPLICATION_SUMMARY_SHELL_OPERATION,
  APPLICATION_SUMMARY_SHELL_SCHEMA_NAME,
  applicationSummaryShellFingerprint,
  runGatedApplicationSummaryShell,
} from "@/lib/application-summary/shell-gate";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import { sourcesForShell } from "@/lib/application-summary/service";
import {
  JOB_REQUIREMENT_PARSE_OPERATION,
  JOB_REQUIREMENT_SCHEMA_NAME,
  interpretJobPosting,
  jobRequirementParseFingerprint,
} from "@/lib/job-requirement/parse";
import { JOB_REQUIREMENT_PROMPT_VERSION } from "@/lib/job-requirement/types";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  SEEKER_BACKGROUND_REASSESS_OPERATION,
  enqueueSeekerBackgroundReassessIfChanged,
  recordSeekerBackgroundReassessFingerprint,
  seekerBackgroundReassessFingerprint,
} from "@/lib/consultation/seeker-background-reassess";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import {
  applicationSummaryConfig,
  applicationWorkspaceCopy,
  consultationConversationCopy,
} from "@/lib/product-config";
import { prisma } from "@/lib/prisma-client";
import { hasTestDatabase } from "@/test/database";

const generateStructured = vi.hoisted(() => vi.fn());
const isInterpretationAiConfigured = vi.hoisted(() => vi.fn(() => true));
const isConsultationAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/config")>();
  return {
    ...actual,
    isInterpretationAiConfigured,
    isConsultationAiConfigured,
  };
});

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return {
    ...actual,
    getInterpretationAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isConsultationAiConfigured,
    getConsultationAiProvider: () => ({ generateStructured }),
  };
});

const shellOverview = {
  companyBackground: { text: "Acme builds warehouse robots.", supports: [] },
  jobRequirements: [{ text: "5 years of Python", supports: [] }],
  whereSeekerShines: [{ text: "Shipped production services.", supports: [] }],
};

describe("Caching Phase 2 batch 1 wiring", () => {
  it("gates the three paid paths with the shared Phase 1 mechanism", () => {
    const parse = readFileSync("src/lib/job-requirement/parse.ts", "utf8");
    expect(parse).toContain("runPaidStructuredCall");
    expect(parse).toContain("JOB_REQUIREMENT_PARSE");
    expect(parse).toContain("jobRequirementParseFingerprint");

    const shellGate = readFileSync(
      "src/lib/application-summary/shell-gate.ts",
      "utf8",
    );
    expect(shellGate).toContain("runPaidStructuredCall");
    expect(shellGate).toContain("APPLICATION_SUMMARY_SHELL");
    const ai = readFileSync("src/lib/application-summary/ai.ts", "utf8");
    expect(ai).toContain("runGatedApplicationSummaryShell");
    const summary = readFileSync(
      "src/lib/application-summary/service.ts",
      "utf8",
    );
    expect(summary).toContain("APPLICATION_SUMMARY_SHELL_OPERATION");
    expect(summary).toContain("applicationSummaryShellFingerprint");

    const knowMe = readFileSync(
      "src/lib/consultation/seeker-background-reassess.ts",
      "utf8",
    );
    expect(knowMe).toContain("CONSULTATION_SEEKER_BACKGROUND_REASSESS");
    expect(knowMe).toContain("enqueueSeekerBackgroundReassessIfChanged");
    const action = readFileSync("src/app/actions/consultation.ts", "utf8");
    expect(action).toContain("enqueueSeekerBackgroundReassessIfChanged");
    const processSrc = readFileSync(
      "src/lib/application-jobs/process.ts",
      "utf8",
    );
    expect(processSrc).toContain('gate === "seeker_background"');
    expect(processSrc).toContain("seekerBackgroundReassessFingerprintChanged");
  });

  it("job-parse fingerprint is stable and includes prompt, schema, posting, notes", () => {
    const a = jobRequirementParseFingerprint({
      rawText: NORMAL_JOB_POSTING,
      seekerLearnedNotes: null,
    });
    const b = jobRequirementParseFingerprint({
      rawText: `  ${NORMAL_JOB_POSTING}  `,
      seekerLearnedNotes: null,
    });
    expect(a).toBe(b);
    expect(a).toBe(
      fingerprintPaidCallInputs({
        promptVersion: JOB_REQUIREMENT_PROMPT_VERSION,
        schemaName: JOB_REQUIREMENT_SCHEMA_NAME,
        postingText: NORMAL_JOB_POSTING.trim(),
        seekerLearnedNotes: null,
      }),
    );
    const withNotes = jobRequirementParseFingerprint({
      rawText: NORMAL_JOB_POSTING,
      seekerLearnedNotes: "They want security sales.",
    });
    expect(withNotes).not.toBe(a);
  });

  it("shell fingerprint uses exact shell sources plus prompt and schema version", () => {
    const sources = [
      { id: "job:title", text: "Senior Engineer", category: "JOB" },
      { id: "job:posting", text: NORMAL_JOB_POSTING, category: "JOB" },
    ];
    const a = applicationSummaryShellFingerprint(sources);
    const b = applicationSummaryShellFingerprint(sources);
    expect(a).toBe(b);
    expect(a).toBe(
      fingerprintPaidCallInputs({
        promptVersion: APPLICATION_SUMMARY_PROMPT_VERSION,
        schemaName: APPLICATION_SUMMARY_SHELL_SCHEMA_NAME,
        sources: sources.map((source) => ({
          id: source.id,
          text: source.text,
          category: source.category,
        })),
      }),
    );
    expect(
      applicationSummaryShellFingerprint([
        ...sources,
        { id: "job:location", text: "Austin", category: "JOB" },
      ]),
    ).not.toBe(a);
  });

  it("sourcesForShell excludes per-person and assessment categories", () => {
    const filtered = sourcesForShell([
      { id: "job:title", text: "Eng", category: "JOB" },
      { id: "persona:1", text: "Persona", category: "PERSONA" },
      { id: "assess:1", text: "Gap", category: "ASSESSMENT" },
      { id: "profile:1", text: "Fact", category: "SEEKER" },
    ]);
    expect(filtered.map((s) => s.id)).toEqual(["job:title", "profile:1"]);
  });

  it("know-about-me fingerprint uses normalized background and consultation prompt version", () => {
    const a = seekerBackgroundReassessFingerprint({
      text: "  Led a robotics team.  ",
    });
    const b = seekerBackgroundReassessFingerprint({
      text: "Led a robotics team.",
    });
    expect(a).toBe(b);
    expect(a).toBe(
      fingerprintPaidCallInputs({
        promptVersion: CONSULTATION_PROMPT_VERSION,
        background: "Led a robotics team.",
      }),
    );
  });

  it("nothing runs on page view for the three gated surfaces", () => {
    const src = (path: string) => readFileSync(path, "utf8");
    for (const path of [
      "src/app/(app)/campaigns/[id]/page.tsx",
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ConsultationSection.tsx",
    ]) {
      const page = src(path);
      expect(page).not.toContain("interpretJobPosting");
      expect(page).not.toContain("generateApplicationSummaryShell");
      expect(page).not.toContain("enqueueSeekerBackgroundReassessIfChanged");
      expect(page).not.toContain("runPaidStructuredCall");
    }
  });

  it("skip messages are exact and only returned when the gate skips", () => {
    expect(applicationWorkspaceCopy.jobPostingUnchanged).toBe(
      "No Changes To Job Posting",
    );
    expect(consultationConversationCopy.knowAboutMeUnchanged).toBe(
      "No Changes To Your Background",
    );
    expect(applicationSummaryConfig.actions.unchanged).toBe(
      "No Changes To Cheat Sheet",
    );
    expect(applicationWorkspaceCopy.jobPostingSaved).not.toBe(
      applicationWorkspaceCopy.jobPostingUnchanged,
    );
    expect(consultationConversationCopy.knowAboutMeSaved).not.toBe(
      consultationConversationCopy.knowAboutMeUnchanged,
    );

    const postingAction = readFileSync("src/app/actions/application.ts", "utf8");
    const postingFn = postingAction.slice(
      postingAction.indexOf("export async function saveApplicationJobPostingAction"),
      postingAction.indexOf("export async function saveApplicationJobLearnedNotesAction"),
    );
    expect(postingFn).toContain("result.skipped");
    expect(postingFn).toContain("jobPostingUnchanged");
    expect(postingFn).toContain("jobPostingSaved");

    const knowMe = readFileSync("src/app/actions/consultation.ts", "utf8");
    const knowMeStart = knowMe.indexOf(
      "export async function saveWhatYouShouldKnowAboutMeAction",
    );
    const knowMeFn = knowMe.slice(knowMeStart, knowMeStart + 2200);
    expect(knowMeFn).toContain("enqueued");
    expect(knowMeFn).toContain("knowAboutMeUnchanged");
    expect(knowMeFn).toContain("knowAboutMeSaved");

    const summaryAction = readFileSync(
      "src/app/actions/application-summary.ts",
      "utf8",
    );
    const summaryFn = summaryAction.slice(
      summaryAction.indexOf("export async function generateApplicationSummaryAction"),
      summaryAction.indexOf("export async function answerCheatSheetCoachAction"),
    );
    expect(summaryFn).toContain("applicationSummaryNothingToRebuild");
    expect(summaryFn).toContain("applicationSummaryConfig.actions.unchanged");
    expect(summaryFn).toContain('workspaceProgressText("APPLICATION_SUMMARY")');

    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const reassess = service.slice(
      service.indexOf("export async function reassessConsultationStanding"),
      service.indexOf("async function processAnswerGeneration"),
    );
    expect(reassess).toContain("seekerBackgroundFingerprint");
    expect(reassess).toContain("recordSeekerBackgroundReassessFingerprint");
    const enqueueSrc = readFileSync(
      "src/lib/consultation/seeker-background-reassess.ts",
      "utf8",
    );
    const enqueueFn = enqueueSrc.slice(
      enqueueSrc.indexOf("export async function enqueueSeekerBackgroundReassessIfChanged"),
    );
    expect(enqueueFn).not.toContain("recordSeekerBackgroundReassessFingerprint");
  });
});

describe.skipIf(!hasTestDatabase())(
  "Caching Phase 2 batch 1 with database",
  // Real Postgres gate fixtures; default 5s fails under parallel suite load.
  { timeout: 60_000 },
  () => {
    const suffix = `p2b1-${Date.now()}`;
    let organizationId = "";
    let productId = "";
    let userId = "";
    let campaignId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] P2B1 ${suffix}`, slug: `p2b1-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `p2b1-${suffix}@example.test`,
          emailNormalized: `p2b1-${suffix}@example.test`,
        },
      });
      userId = user.id;
      const product = await prisma.product.create({
        data: { organizationId, name: `P2B1 Product ${suffix}` },
      });
      productId = product.id;
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `P2B1 App ${suffix}`,
          productId,
        },
      });
      campaignId = campaign.id;
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId,
          rawText: NORMAL_JOB_POSTING,
          title: NORMAL_JOB_MODEL.title,
          companyName: NORMAL_JOB_MODEL.companyName,
          reportingLine: NORMAL_JOB_MODEL.reportingLine,
          responsibilities: NORMAL_JOB_MODEL.responsibilities,
          requiredItems: NORMAL_JOB_MODEL.requiredItems,
          preferredItems: NORMAL_JOB_MODEL.preferredItems,
          scorecardJson: NORMAL_JOB_MODEL.scorecard,
          employerDisposition: "UNDISCLOSED",
        },
      });
    });

    afterEach(() => {
      generateStructured.mockReset();
      isInterpretationAiConfigured.mockReturnValue(true);
      isConsultationAiConfigured.mockReturnValue(true);
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
      if (userId) {
        await prisma.user
          .delete({ where: { id: userId } })
          .catch(() => undefined);
      }
    });

    it("job parse: unchanged inputs skip provider; change runs once; retry skips", async () => {
      const parsed = normalizeParsedJobRequirement(
        NORMAL_JOB_MODEL,
        NORMAL_JOB_POSTING,
      );
      generateStructured.mockResolvedValue({
        data: {
          title: parsed.title,
          companyName: parsed.companyName,
          location: parsed.location,
          workArrangement: parsed.workArrangement,
          employmentType: parsed.employmentType,
          seniority: parsed.seniority,
          compensationRange: parsed.compensationRange,
          reportingLine: parsed.reportingLine,
          responsibilities: parsed.responsibilities,
          requiredItems: parsed.requiredItems,
          preferredItems: parsed.preferredItems,
          scorecard: {
            missionText: parsed.scorecard.mission?.text ?? null,
            missionInferred: parsed.scorecard.mission?.inferred ?? false,
            outcomes: parsed.scorecard.outcomes,
            competencies: parsed.scorecard.competencies,
          },
          namedContacts: [],
        },
      });
      const usage = {
        organizationId,
        userId,
        campaignId,
        category: "INTERPRETATION" as const,
        operation: "JOB_REQUIREMENT_PARSE" as const,
      };
      const first = await interpretJobPosting(NORMAL_JOB_POSTING, usage);
      expect(first.skipped).toBe(false);
      expect(first.data.title).toBe(parsed.title);
      expect(generateStructured).toHaveBeenCalledTimes(1);

      const second = await interpretJobPosting(NORMAL_JOB_POSTING, usage);
      expect(second.skipped).toBe(true);
      expect(second.data.title).toBe(parsed.title);
      expect(generateStructured).toHaveBeenCalledTimes(1);

      const changed = await interpretJobPosting(
        `${NORMAL_JOB_POSTING}\nUpdated title line`,
        usage,
      );
      expect(changed.skipped).toBe(false);
      expect(generateStructured).toHaveBeenCalledTimes(2);

      // Worker-style retry after receipt: same fingerprint → no provider.
      let retryCalls = 0;
      const fingerprint = jobRequirementParseFingerprint({
        rawText: `${NORMAL_JOB_POSTING}\nUpdated title line`,
      });
      await runPaidStructuredCall({
        organizationId,
        operation: JOB_REQUIREMENT_PARSE_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fingerprint,
        parseStored: (json) => json as typeof first.data,
        isResultUsable: (stored) => Boolean(stored && typeof stored === "object"),
        callProvider: async () => {
          retryCalls += 1;
          return first.data;
        },
      });
      expect(retryCalls).toBe(0);
    });

    it("cheat-sheet shell: unchanged sources skip provider; change runs once; retry skips", async () => {
      const sources = [
        { id: "job:title", text: "Senior Engineer", category: "JOB" },
        { id: "job:posting", text: NORMAL_JOB_POSTING, category: "JOB" },
      ];
      let calls = 0;
      const first = await runGatedApplicationSummaryShell({
        organizationId,
        campaignId,
        sources,
        callProvider: async () => {
          calls += 1;
          return { overview: shellOverview };
        },
      });
      expect(first.skipped).toBe(false);
      expect(calls).toBe(1);

      const second = await runGatedApplicationSummaryShell({
        organizationId,
        campaignId,
        sources,
        callProvider: async () => {
          calls += 1;
          return { overview: shellOverview };
        },
      });
      expect(second.skipped).toBe(true);
      expect(calls).toBe(1);

      const changed = await runGatedApplicationSummaryShell({
        organizationId,
        campaignId,
        sources: [
          ...sources,
          { id: "job:location", text: "Austin, TX", category: "JOB" },
        ],
        callProvider: async () => {
          calls += 1;
          return { overview: shellOverview };
        },
      });
      expect(changed.skipped).toBe(false);
      expect(calls).toBe(2);

      let retryCalls = 0;
      const fingerprint = applicationSummaryShellFingerprint([
        ...sources,
        { id: "job:location", text: "Austin, TX", category: "JOB" },
      ]);
      await runPaidStructuredCall({
        organizationId,
        operation: APPLICATION_SUMMARY_SHELL_OPERATION,
        subjectKey: campaignId,
        inputFingerprint: fingerprint,
        parseStored: (json) => json as { overview: typeof shellOverview },
        isResultUsable: (stored) => Boolean(stored?.overview),
        callProvider: async () => {
          retryCalls += 1;
          return { overview: shellOverview };
        },
      });
      expect(retryCalls).toBe(0);
    });

    it("know-about-me: enqueue does not record; failed reassess allows retry; success blocks re-save", async () => {
      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "CONSULTATION" },
      });
      await prisma.paidCallReceipt.deleteMany({
        where: {
          organizationId,
          operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
          subjectKey: campaignId,
        },
      });

      const text = "I led warehouse robotics launches for three years.";
      const first = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text,
      });
      expect(first).toBe(true);
      const jobsAfterFirst = await prisma.applicationJob.findMany({
        where: { campaignId, type: "CONSULTATION" },
      });
      expect(jobsAfterFirst).toHaveLength(1);
      const payload = jobsAfterFirst[0]?.payload as {
        gate?: string;
        fingerprint?: string;
        operation?: string;
      };
      expect(payload.gate).toBe("seeker_background");
      expect(payload.operation).toBe("reassess");
      expect(payload.fingerprint).toBe(
        seekerBackgroundReassessFingerprint({ text }),
      );
      // Enqueue alone must not write the receipt (failed job can retry).
      expect(
        await prisma.paidCallReceipt.findUnique({
          where: {
            organizationId_operation_subjectKey: {
              organizationId,
              operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
              subjectKey: campaignId,
            },
          },
        }),
      ).toBeNull();

      // Simulate failed reassess: no receipt → re-save enqueues again.
      await prisma.applicationJob.update({
        where: { id: jobsAfterFirst[0]!.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: "provider timeout",
        },
      });
      const afterFail = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text,
      });
      expect(afterFail).toBe(true);
      expect(
        await prisma.applicationJob.count({
          where: { campaignId, type: "CONSULTATION", status: "PENDING" },
        }),
      ).toBeGreaterThanOrEqual(1);

      // Successful record (post-reassess) → same text enqueues nothing.
      await recordSeekerBackgroundReassessFingerprint({
        organizationId,
        campaignId,
        fingerprint: payload.fingerprint!,
      });
      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "CONSULTATION", status: "PENDING" },
      });
      const afterSuccess = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text,
      });
      expect(afterSuccess).toBe(false);
      expect(
        await prisma.applicationJob.count({
          where: { campaignId, type: "CONSULTATION", status: "PENDING" },
        }),
      ).toBe(0);

      const third = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text: `${text} Also owned on-call.`,
      });
      expect(third).toBe(true);

      // Worker second line: recorded receipt + same fingerprint → no change.
      const { seekerBackgroundReassessFingerprintChanged } = await import(
        "@/lib/consultation/seeker-background-reassess"
      );
      const retry = await seekerBackgroundReassessFingerprintChanged({
        organizationId,
        campaignId,
        text,
      });
      expect(retry.changed).toBe(false);
    });

    it("know-about-me: pending same-input reassess does not create a duplicate job", async () => {
      await prisma.applicationJob.deleteMany({
        where: { campaignId, type: "CONSULTATION" },
      });
      await prisma.paidCallReceipt.deleteMany({
        where: {
          organizationId,
          operation: SEEKER_BACKGROUND_REASSESS_OPERATION,
          subjectKey: campaignId,
        },
      });
      const text = "Duplicate-prevention background note for robotics.";
      const first = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text,
      });
      expect(first).toBe(true);
      const second = await enqueueSeekerBackgroundReassessIfChanged({
        organizationId,
        campaignId,
        userId,
        text,
      });
      expect(second).toBe(true);
      expect(
        await prisma.applicationJob.count({
          where: {
            campaignId,
            type: "CONSULTATION",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        }),
      ).toBe(1);
    });
  },
);
