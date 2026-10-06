import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSULTATION_PLAN_DECISION_INSTRUCTIONS } from "@/lib/prompt-content/consultation-plan-decision";
import { ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
import { hasTestDatabase } from "@/test/database";

const calls = vi.hoisted(() => [] as Array<{
  model: string;
  role: string;
  schemaName?: string;
  schema?: unknown;
  usage?: unknown;
  webSearchEnabled?: boolean;
  messages: Array<{ role: string; content: string }>;
}>);

vi.mock("@/lib/ai/provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/provider")>();
  return {
    ...actual,
    createAiProvider: (config: { model: string; role: string }) => ({
    async generateStructured(request: {
      schemaName?: string;
      schema?: unknown;
      usage?: unknown;
      webSearchEnabled?: boolean;
      messages: Array<{ role: string; content: string }>;
    }) {
      calls.push({
        model: config.model,
        role: config.role,
        schemaName: request.schemaName,
        schema: request.schema,
        usage: request.usage,
        webSearchEnabled: request.webSearchEnabled,
        messages: request.messages,
      });
      const stamp = config.model;
      if (request.schemaName === "consultation_plan_decision_experiment") {
        return {
          data: {
            assessments: [
              {
                targetKey: "gap-1",
                strength: "PARTIAL",
                supportingFactIds: ["fact-1"],
                relevantRoleIds: ["role-1"],
                strategyMode: "PROVE_WITH_STORY",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                text: "terra decision question",
                hiringTeamRoleId: "role",
                interviewTypeTag: "focused_competency",
              },
            ],
          },
          usage: tokenUsage(false, 128),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan_writing_experiment") {
        return {
          data: {
            overall: "You stand well for this job.",
            strongestAngles: ["Angle one", "Angle two"],
            importantGaps: ["A gap remains."],
            commentary: "luna writing note",
            closingNote: null,
            assessments: [
              {
                targetKey: "gap-1",
                explanation: "Partial evidence.",
                strategy: "Prove it with the payroll story.",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                whoCaresNote: "The hiring manager needs this.",
                requirementInterpretation: null,
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan_lean_decision_experiment") {
        return {
          data: {
            assessments: [
              {
                targetKey: "gap-1",
                strength: "PARTIAL",
                strategyMode: "PROVE_WITH_STORY",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                text: "lean decision question",
                hiringTeamRoleId: "role-ht",
                interviewTypeTag: "focused_competency",
              },
            ],
          },
          usage: tokenUsage(false, 40),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan_lean_writing_experiment") {
        return {
          data: {
            overall: "You stand well for this job.",
            strongestAngles: ["Angle one", "Angle two"],
            importantGaps: ["A gap remains."],
            commentary: "lean writing note",
            closingNote: null,
            assessments: [
              {
                targetKey: "gap-1",
                strength: "NONE",
                strategyMode: "ACKNOWLEDGE",
                supportingFactIds: ["skill_profile_marker", "invented-fact"],
                relevantRoleIds: ["role_profile_marker", "invented-role"],
                explanation: "Partial evidence.",
                strategy: "Prove it with the payroll story.",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                text: "rewritten question",
                hiringTeamRoleId: "other-role",
                interviewTypeTag: "screening",
                whoCaresNote: "The hiring manager needs this.",
                requirementInterpretation: null,
              },
              {
                targetKey: "not-in-decision",
                text: "extra question",
                hiringTeamRoleId: "other-role",
                interviewTypeTag: "screening",
                whoCaresNote: "Ignore me.",
                requirementInterpretation: null,
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan_decision") {
        return {
          data: {
            assessments: [
              {
                targetKey: "gap-1",
                strength: "PARTIAL",
                strategyMode: "PROVE_WITH_STORY",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                text: "production decision question",
                hiringTeamRoleId: "role-ht",
                interviewTypeTag: "focused_competency",
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan_writing") {
        return {
          data: {
            overall: "You stand well for this job.",
            strongestAngles: ["Angle one", "Angle two"],
            importantGaps: ["A gap remains."],
            commentary: "production lean plan",
            closingNote: null,
            assessments: [
              {
                targetKey: "gap-1",
                supportingFactIds: [],
                relevantRoleIds: [],
                explanation: "Partial evidence.",
                strategy: "Prove it with the payroll story.",
              },
            ],
            questions: [
              {
                targetKey: "gap-1",
                whoCaresNote: "The hiring manager needs this.",
                requirementInterpretation: null,
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "consultation_plan") {
        return {
          data: {
            commentary: `${stamp} plan`,
            briefing: {
              overall: "Overall",
              strongestAngles: ["Angle one", "Angle two"],
              importantGaps: ["A gap"],
              storyPlan: [],
            },
            closingNote: null,
            assessments: [],
            questions: [
              {
                targetKey: "gap-1",
                text: `${stamp} planning question`,
                requirementInterpretation: null,
                hiringTeamRoleId: "role",
                whoCaresNote: "The hiring manager needs this.",
                interviewTypeTag: "focused_competency",
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "role_expertise_questions") {
        return {
          data: {
            questions: [
              {
                text: `${stamp} best-practice question`,
                interviewTypeTag: "focused_competency",
              },
            ],
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      if (request.schemaName === "application_summary_shell") {
        return {
          data: {
            overview: {
              companyBackground: { text: `${stamp} overview` },
              jobRequirements: [{ text: "Lead the team" }],
              whereSeekerShines: [{ text: "Payroll depth" }],
            },
          },
          usage: tokenUsage(false),
          provider: "openai-responses",
          model: stamp,
          modelUrlIdentifier: "example",
          rawText: "",
        };
      }
      return {
        data: {
          companySummary: `${stamp} researched Northwind Payroll`,
          whatTheySell: "Payroll software",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: "Subscription",
          companySizeContext: "Mid-size",
          relevantTechnologies: [],
          hiringSignals: ["Hiring payroll leads"],
          riskSignals: [],
          jobFocus: "Payroll",
          jobFocusDetail: "Hospital payroll operations",
          confidence: "MEDIUM",
          sources: [
            {
              url: "https://northwind.example/",
              title: "Northwind",
              publisher: null,
              sourceType: "COMPANY_WEBSITE",
              retrievedAt: "2026-10-03T00:00:00.000Z",
              supports: ["companySummary"],
            },
          ],
        },
        usage: tokenUsage(Boolean(request.webSearchEnabled)),
        provider: "openai-responses",
        model: stamp,
        modelUrlIdentifier: "example",
        retrievedSources: [],
        rawText: "",
      };
    },
    }),
  };
});

vi.mock("@/lib/research/sources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research/sources")>();
  return {
    ...actual,
    getCompanySourceRetriever: () => ({
      async retrieve() {
        return {
          sources: [
            {
              url: "https://northwind.example/",
              title: "Northwind",
              publisher: null,
              sourceType: "COMPANY_WEBSITE" as const,
              retrievedAt: "2026-10-03T00:00:00.000Z",
              supports: [],
            },
          ],
          excerpts: [
            {
              url: "https://northwind.example/",
              title: "Northwind",
              text: "Northwind Payroll builds payroll software. The CEO was appointed in 2026. It is privately owned and competes with other payroll firms.",
            },
          ],
          homepageHtml: null,
          homepageUrl: null,
        };
      },
    }),
  };
});

function tokenUsage(webSearch: boolean, reasoningTokens?: number) {
  return {
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 10,
    cacheWriteTokens: 5,
    webSearchCalls: webSearch ? 3 : 0,
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
  };
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

function envSnapshot(): string {
  return JSON.stringify(
    Object.keys(process.env)
      .sort()
      .map((key) => [key, process.env[key]]),
  );
}

describe("model comparison script cannot be invoked by the app", () => {
  it("is not referenced by a page, job, or schedule", () => {
    const root = resolve(process.cwd());
    const files = [
      ...walk(join(root, "src/app")),
      ...walk(join(root, "src/lib/application-jobs")),
      join(root, "scripts/research-worker.ts"),
      join(root, "package.json"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("compare-models");
      expect(source, file).not.toContain("runModelComparison");
    }
    const script = readFileSync(join(root, "scripts/compare-models.ts"), "utf8");
    expect(script).toContain("tsx --conditions=react-server scripts/compare-models.ts");
    expect(script).not.toContain("enqueueApplicationJob");
    expect(script).not.toContain("prisma.usageEvent.create");
  });
});

describe.skipIf(!hasTestDatabase())(
  "model comparison (Postgres, mocked providers)",
  { timeout: 120_000 },
  () => {
    let campaignId = "";
    let organizationId = "";
    let ownerUserId = "";
    let ready = false;

    beforeAll(async () => {
      const { prisma } = await import("@/lib/prisma-client");
      const { PrismaClient } = await import("@prisma/client");
      const probe = new PrismaClient();
      try {
        await probe.$queryRaw`SELECT 1 FROM "Campaign" LIMIT 0`;
      } catch {
        console.warn("Skipping model comparison DB tests: database is not migrated.");
        await probe.$disconnect();
        return;
      }
      await probe.$disconnect();

      for (const prefix of ["CONSULTATION_AI", "CONSULTATION_REPLY_AI", "RESEARCH_AI"]) {
        process.env[`${prefix}_PROVIDER`] = "openai-responses";
        process.env[`${prefix}_MODEL`] = "gpt-5.6-terra";
        process.env[`${prefix}_MODEL_URL`] = "https://api.openai.com/v1/responses";
        process.env[`${prefix}_API_KEY`] = "test-key";
      }

      const suffix = `cmp_${Date.now().toString(36)}`;
      const email = `compare-${suffix}@example.test`;
      const authId = `auth_compare_${suffix}`;
      await prisma.authUser.create({
        data: {
          id: authId,
          name: "Compare",
          email,
          emailVerified: true,
          firstName: "Compare",
          lastName: "Models",
        },
      });
      await prisma.authAccount.create({
        data: {
          id: `acct_${authId}`,
          accountId: authId,
          providerId: "credential",
          issuer: "local:credential",
          userId: authId,
          password: "test-hash",
        },
      });
      const { provisionIndividualWorkspace } = await import("@/lib/auth/provision");
      const provisioned = await provisionIndividualWorkspace({
        authUserId: authId,
        email,
        firstName: "Compare",
        lastName: "Models",
        companyName: `Compare ${suffix}`,
      });
      organizationId = provisioned.organization!.id;
      const userId = provisioned.user.id;
      ownerUserId = userId;
      const { emptyCandidateProfile } = await import(
        "@/lib/product-research/candidate-profile"
      );
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          profileJson: emptyCandidateProfile(),
        },
      });
      const company = await prisma.company.create({
        data: {
          organizationId,
          name: "Northwind Payroll",
          normalizedName: `northwind payroll ${suffix}`,
          website: "https://northwind.example",
          normalizedDomain: `northwind-${suffix}.example`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `Comparison application ${suffix}`,
          productId: product.id,
          companyResearchNotes: "Seeker note: hospital payroll.",
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          companyId: company.id,
          title: "Comparison Nurse Manager",
          companyName: "Northwind Payroll",
          rawText:
            "Comparison Nurse Manager at Northwind Payroll. Leads a payroll team.",
          suppliedEmployerWebsite: "https://northwind.example",
          requiredItems: ["payroll"],
          responsibilities: ["lead the team"],
          preferredItems: [],
          scorecardJson: {
            mission: { text: "Run payroll" },
            outcomes: [],
            competencies: [],
          },
        },
      });
      const { SEED_AI_MODEL_RATES } = await import("@/lib/platform/model-rates");
      for (const row of SEED_AI_MODEL_RATES) {
        if (row.model !== "gpt-5.6-terra" && row.model !== "gpt-5.6-luna") continue;
        await prisma.aiModelRate.upsert({
          where: {
            provider_model_effectiveFrom: {
              provider: row.provider,
              model: row.model,
              effectiveFrom: row.effectiveFrom,
            },
          },
          update: {},
          create: row,
        });
      }
      campaignId = campaign.id;
      ready = true;
    });

    afterAll(async () => {
      const { prisma } = await import("@/lib/prisma-client");
      await prisma.$disconnect();
    });

    it("builds production inputs, calls each model once, and writes nothing", async () => {
      if (!ready) return;
      const { runModelComparison, snapshotOrganizationTables } = await import(
        "@/lib/model-comparison/compare"
      );
      const beforeTables = await snapshotOrganizationTables(organizationId);
      const beforeEnv = envSnapshot();
      calls.length = 0;
      const report = await runModelComparison({
        campaignId,
        writeReport: false,
      });
      const afterTables = await snapshotOrganizationTables(organizationId);
      expect(afterTables).toEqual(beforeTables);
      expect(envSnapshot()).toBe(beforeEnv);

      const bySchema = (schemaName: string) =>
        calls.filter((call) => call.schemaName === schemaName);
      for (const schemaName of [
        "role_expertise_questions",
        "application_summary_shell",
      ]) {
        const matched = bySchema(schemaName);
        expect(matched.map((call) => call.model).sort()).toEqual([
          "gpt-5.6-luna",
          "gpt-5.6-terra",
        ]);
        for (const call of matched) {
          expect(call.usage).toBeUndefined();
        }
      }
      const researchCalls = bySchema("CompanyResearchAiResult");
      for (const model of ["gpt-5.6-terra", "gpt-5.6-luna"]) {
        const matched = researchCalls.filter((call) => call.model === model);
        expect(matched.length).toBeGreaterThan(0);
        expect(matched.length).toBeLessThanOrEqual(4);
        for (const call of matched) expect(call.usage).toBeUndefined();
      }
      expect(calls.every((call) => call.usage == null)).toBe(true);

      const decisionCall = calls.find(
        (call) => call.schemaName === "consultation_plan_decision",
      );
      const writingCall = calls.find(
        (call) => call.schemaName === "consultation_plan_writing",
      );
      expect(decisionCall?.model).toBe("gpt-5.6-terra");
      expect(writingCall?.model).toBe("gpt-5.6-luna");
      expect(writingCall?.role).toBe("consultation_reply");
      expect(decisionCall?.messages[0]?.content).toContain(
        CONSULTATION_PLAN_DECISION_INSTRUCTIONS,
      );
      expect(decisionCall?.messages[0]?.content).not.toContain(
        "EXPERIMENTAL. Not production.",
      );
      const planning = decisionCall;
      expect(
        planning?.messages.some((message) => message.content.includes("payroll")),
      ).toBe(true);
      const questions = calls.find(
        (call) => call.schemaName === "role_expertise_questions",
      );
      expect(questions?.messages[0]?.content).toContain(
        ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS,
      );
      expect(
        questions?.messages.some((message) =>
          message.content.includes("Comparison Nurse Manager"),
        ),
      ).toBe(true);
      const shell = calls.find(
        (call) => call.schemaName === "application_summary_shell",
      );
      expect(
        shell?.messages.some((message) =>
          message.content.includes("Comparison Nurse Manager"),
        ),
      ).toBe(true);
      const research = calls.find(
        (call) => call.schemaName === "CompanyResearchAiResult",
      );
      expect(
        research?.messages.some((message) =>
          message.content.includes("Northwind Payroll"),
        ),
      ).toBe(true);

      expect(report.markdown).toContain("production decision question");
      expect(report.markdown).toContain("production lean plan");
      expect(report.markdown).toContain("gpt-5.6-terra best-practice question");
      expect(report.markdown).toContain("gpt-5.6-luna best-practice question");
      expect(report.markdown).toContain("gpt-5.6-terra overview");
      expect(report.markdown).toContain("gpt-5.6-luna overview");
      expect(report.markdown).toContain("gpt-5.6-terra researched Northwind Payroll");
      expect(report.markdown).toContain("gpt-5.6-luna researched Northwind Payroll");
      expect(report.markdown).toContain("Input tokens");
      expect(report.markdown).toContain("1000");
      expect(report.markdown).toContain("Output tokens");
      expect(report.markdown).toContain("200");
      expect(report.markdown).toContain("Web searches");
      expect(report.markdown).toContain("Cost");
      expect(report.markdown).toContain("## Total");
      expect(report.totals["gpt-5.6-terra"]).toBeGreaterThan(0);
      expect(report.totals["gpt-5.6-luna"]).toBeGreaterThan(0);
      expect(report.markdown).toContain(RENDER_COMMAND_FRAGMENT);
    });

    it("dry run prints inputs and estimated cost without a model call", async () => {
      if (!ready) return;
      const { runModelComparison } = await import("@/lib/model-comparison/compare");
      const before = calls.length;
      const beforeEnv = envSnapshot();
      const report = await runModelComparison({
        campaignId,
        dryRun: true,
        writeReport: false,
      });
      expect(calls.length).toBe(before);
      expect(envSnapshot()).toBe(beforeEnv);
      expect(report.dryRun).toBe(true);
      expect(report.markdown).toContain("Dry run: yes");
      expect(report.markdown).toContain("Comparison Nurse Manager");
      expect(report.markdown).toContain("Northwind Payroll");
      expect(report.markdown).toContain("$0.000000");
      expect(report.markdown).toContain("web-search ceiling");
      expect(report.totals["gpt-5.6-terra"]).toBe(0);
      expect(report.totals["gpt-5.6-luna"]).toBe(0);
    });

    it("planning without the new options stays terra versus luna", async () => {
      if (!ready) return;
      const { runModelComparison, snapshotOrganizationTables } = await import(
        "@/lib/model-comparison/compare"
      );
      const { CONSULTATION_PROMPT_VERSION } = await import(
        "@/lib/consultation/contract"
      );
      const beforeTables = await snapshotOrganizationTables(organizationId);
      const beforeEnv = envSnapshot();
      calls.length = 0;
      const report = await runModelComparison({
        campaignId,
        steps: ["planning"],
        writeReport: false,
      });
      expect(await snapshotOrganizationTables(organizationId)).toEqual(beforeTables);
      expect(envSnapshot()).toBe(beforeEnv);
      expect(CONSULTATION_PROMPT_VERSION).toBe("39");
      expect(report.mode).toBe("current");
      expect(report.fresh).toBe(false);
      expect(report.wroteToDatabase).toBe(false);
      const planningCalls = calls.filter(
        (call) =>
          call.schemaName === "consultation_plan_decision" ||
          call.schemaName === "consultation_plan_writing",
      );
      expect(planningCalls.map((call) => `${call.model}:${call.schemaName}`)).toEqual([
        "gpt-5.6-terra:consultation_plan_decision",
        "gpt-5.6-luna:consultation_plan_writing",
      ]);
      expect(
        calls.some((call) =>
          String(call.schemaName).includes("experiment"),
        ),
      ).toBe(false);
      expect(report.markdown).toContain("Reasoning tokens");
      expect(report.markdown).toContain("not returned");
      expect(report.markdown).toContain("wroteToDatabase: false");
    });

    it("fresh builds the first round and split compares four planning variants", async () => {
      if (!ready) return;
      const { prisma } = await import("@/lib/prisma-client");
      const { emptyCandidateProfile } = await import(
        "@/lib/product-research/candidate-profile"
      );
      const { candidateProfileSchema } = await import(
        "@/lib/product-research/candidate-profile"
      );
      const profile = candidateProfileSchema.parse({
        ...emptyCandidateProfile(),
        skills: [
          {
            id: "skill_profile_marker",
            kind: "FACT",
            text: "PROFILE_MARKER hospital payroll lead",
            provenance: [{ sourceId: "source_test" }],
          },
        ],
        experience: [
          {
            id: "role_profile_marker",
            kind: "FACT",
            employer: "City Hospital",
            title: "PROFILE_ROLE_MARKER Nurse Manager",
            startDate: "2022-01",
            endDate: null,
            summary: null,
            achievements: [],
            provenance: [{ sourceId: "source_test" }],
          },
        ],
      });
      const suffix = `fresh_${Date.now().toString(36)}`;
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Fresh profile ${suffix}`,
          profileJson: profile,
        },
      });
      const company = await prisma.company.create({
        data: {
          organizationId,
          name: "Fresh Northwind",
          normalizedName: `fresh northwind ${suffix}`,
          website: `https://fresh-${suffix}.example`,
          normalizedDomain: `fresh-${suffix}.example`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId,
          name: `Fresh application ${suffix}`,
          productId: product.id,
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          companyId: company.id,
          title: "FRESH_JOB_MARKER Nurse Manager",
          companyName: "Fresh Northwind",
          rawText: "FRESH_JOB_MARKER Nurse Manager at Fresh Northwind.",
          suppliedEmployerWebsite: `https://fresh-${suffix}.example`,
          requiredItems: ["payroll operations"],
          responsibilities: ["lead the team"],
          preferredItems: [],
          scorecardJson: {
            mission: { text: "Run payroll" },
            outcomes: [],
            competencies: [],
          },
        },
      });
      await prisma.applicationEmployerResearch.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          companyId: company.id,
          status: "COMPLETED",
          companySummary: "RESEARCH_MARKER Northwind runs hospital payroll",
          anchorHost: `fresh-${suffix}.example`,
          researchedAt: new Date(),
        },
      });
      const session = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          productId: product.id,
          promptVersion: "37",
          status: "IN_PROGRESS",
          generationStatus: "READY",
        },
      });
      for (let index = 0; index < 20; index += 1) {
        await prisma.consultationTurn.create({
          data: {
            organizationId,
            sessionId: session.id,
            sequence: index + 1,
            speaker: "CONSULTANT",
            body: `STORED_GAP_QUESTION_${index} about payroll`,
            targetKey: `gap-${index}`,
          },
        });
      }
      await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId: session.id,
          sequence: 21,
          speaker: "SEEKER",
          body: "STORED_SEEKER_ANSWER I led payroll.",
          targetKey: "gap-0",
          seekerAuthored: true,
        },
      });
      await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId: session.id,
          sequence: 22,
          speaker: "CONSULTANT",
          body: "STORED_BEST_PRACTICE how do you coach a team",
          targetKey: "role-expertise:stored",
        },
      });

      const libraryProduct = await prisma.product.create({
        data: {
          organizationId,
          name: `Library profile ${suffix}`,
          profileJson: emptyCandidateProfile(),
        },
      });
      const libraryCampaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId,
          name: `Library application ${suffix}`,
          productId: libraryProduct.id,
        },
      });
      const librarySession = await prisma.consultationSession.create({
        data: {
          organizationId,
          campaignId: libraryCampaign.id,
          productId: libraryProduct.id,
          promptVersion: "37",
        },
      });
      const libraryTurn = await prisma.consultationTurn.create({
        data: {
          organizationId,
          sessionId: librarySession.id,
          sequence: 1,
          speaker: "CONSULTANT",
          body: "How did you lead a payroll conversion for a hospital?",
          targetKey: "role-expertise:library",
          questionContextJson: { interviewTypeTag: "focused_competency" },
        },
      });
      await prisma.consultationStatement.create({
        data: {
          organizationId,
          sessionId: librarySession.id,
          turnId: libraryTurn.id,
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: "LIBRARY_MARKER I led the hospital payroll conversion.",
          groundingJson: {},
          promptVersion: "37",
          approvedAt: new Date(),
        },
      });

      const { runModelComparison, snapshotOrganizationTables } = await import(
        "@/lib/model-comparison/compare"
      );
      const { CONSULTATION_PROMPT_VERSION } = await import(
        "@/lib/consultation/contract"
      );
      const { findHarperLibraryMatch } = await import(
        "@/lib/consultation/harper-library"
      );
      const { zodToOpenAiStrictJsonSchema } = await import(
        "@/lib/ai/zod-json-schema"
      );
      const { estimateEventCostUsd } = await import("@/lib/platform/cost");
      const { SEED_AI_MODEL_RATES } = await import("@/lib/platform/model-rates");

      const library = await findHarperLibraryMatch({
        organizationId,
        campaignId: campaign.id,
        question: "How did you lead a payroll conversion for a hospital?",
        interviewTypeTag: "focused_competency",
      });
      expect(library?.content).toContain("LIBRARY_MARKER");

      const beforeTables = await snapshotOrganizationTables(organizationId);
      const beforeEnv = envSnapshot();
      calls.length = 0;
      const skipped = await runModelComparison({
        campaignId: campaign.id,
        steps: ["questions"],
        writeReport: false,
      });
      expect(
        calls.some((call) => call.schemaName === "role_expertise_questions"),
      ).toBe(false);
      expect(skipped.markdown).toContain(
        "Production would not select more best-practice questions",
      );

      calls.length = 0;
      const fresh = await runModelComparison({
        campaignId: campaign.id,
        steps: ["planning", "questions"],
        fresh: true,
        writeReport: false,
      });
      expect(await snapshotOrganizationTables(organizationId)).toEqual(beforeTables);
      expect(envSnapshot()).toBe(beforeEnv);
      expect(CONSULTATION_PROMPT_VERSION).toBe("39");
      expect(fresh.fresh).toBe(true);
      expect(fresh.wroteToDatabase).toBe(false);

      const planning = calls.find(
        (call) => call.schemaName === "consultation_plan_decision",
      );
      const planningText = planning?.messages.map((message) => message.content).join("\n") ?? "";
      expect(planningText).toContain("PROFILE_MARKER hospital payroll lead");
      expect(planningText).toContain("PROFILE_ROLE_MARKER Nurse Manager");
      expect(planningText).toContain("payroll operations");
      expect(planningText).toContain("RESEARCH_MARKER Northwind runs hospital payroll");
      expect(planningText).not.toContain("STORED_GAP_QUESTION_0");
      expect(planningText).not.toContain("STORED_SEEKER_ANSWER");
      expect(planningText).not.toContain("STORED_BEST_PRACTICE");
      expect(planningText).not.toContain("LIBRARY_MARKER");
      const round = planning?.messages.find(
        (message) =>
          message.content.startsWith("{") &&
          message.content.includes("\"askedQuestions\""),
      );
      const roundJson = JSON.parse(round?.content ?? "{}") as {
        askedQuestions?: unknown[];
        coveredTargetKeys?: unknown[];
      };
      expect(roundJson.askedQuestions).toEqual([]);
      expect(roundJson.coveredTargetKeys).toEqual([]);

      const questions = calls.filter(
        (call) => call.schemaName === "role_expertise_questions",
      );
      expect(questions.map((call) => call.model).sort()).toEqual([
        "gpt-5.6-luna",
        "gpt-5.6-terra",
      ]);
      const questionText = questions[0]?.messages.map((message) => message.content).join("\n") ?? "";
      expect(questionText).toContain("FRESH_JOB_MARKER Nurse Manager");
      expect(questionText).toContain("RESEARCH_MARKER Northwind runs hospital payroll");
      expect(questionText).toContain("PROFILE_ROLE_MARKER Nurse Manager");
      expect(questionText).not.toContain("STORED_GAP_QUESTION_0");
      expect(questionText).not.toContain("STORED_BEST_PRACTICE");
      expect(questionText).not.toContain("LIBRARY_MARKER");
      const questionPayload = JSON.parse(questions[0]?.messages[1]?.content ?? "{}") as {
        askedQuestions?: unknown[];
      };
      expect(questionPayload.askedQuestions).toEqual([]);

      calls.length = 0;
      const split = await runModelComparison({
        campaignId: campaign.id,
        steps: ["planning"],
        fresh: true,
        mode: "split",
        writeReport: false,
      });
      expect(await snapshotOrganizationTables(organizationId)).toEqual(beforeTables);
      expect(envSnapshot()).toBe(beforeEnv);
      expect(CONSULTATION_PROMPT_VERSION).toBe("39");
      expect(split.mode).toBe("split");
      expect(split.wroteToDatabase).toBe(false);

      const names = calls.map((call) => `${call.model}:${call.schemaName}`);
      expect(names).toEqual([
        "gpt-5.6-terra:consultation_plan_decision",
        "gpt-5.6-luna:consultation_plan_writing",
        "gpt-5.6-terra:consultation_plan_decision_experiment",
        "gpt-5.6-luna:consultation_plan_writing_experiment",
        "gpt-5.6-luna:consultation_plan",
        "gpt-5.6-terra:consultation_plan_lean_decision_experiment",
        "gpt-5.6-luna:consultation_plan_lean_writing_experiment",
      ]);
      const decision = calls[2];
      const writing = calls[3];
      expect(writing?.role).toBe("consultation_reply");
      const decisionJson = zodToOpenAiStrictJsonSchema(
        decision?.schema as Parameters<typeof zodToOpenAiStrictJsonSchema>[0],
      );
      const decisionProperties =
        decisionJson.properties && typeof decisionJson.properties === "object"
          ? (decisionJson.properties as Record<string, unknown>)
          : {};
      expect(Object.keys(decisionProperties)).toEqual([
        "assessments",
        "questions",
      ]);
      function itemPropertyNames(node: unknown): string[] {
        if (!node || typeof node !== "object") return [];
        const items = (node as { items?: { properties?: unknown } }).items;
        const properties = items?.properties;
        if (!properties || typeof properties !== "object") return [];
        return Object.keys(properties as object);
      }
      expect(itemPropertyNames(decisionProperties.assessments).sort()).toEqual([
        "relevantRoleIds",
        "strategyMode",
        "strength",
        "supportingFactIds",
        "targetKey",
      ]);
      expect(itemPropertyNames(decisionProperties.questions).sort()).toEqual([
        "hiringTeamRoleId",
        "interviewTypeTag",
        "targetKey",
        "text",
      ]);
      expect(
        writing?.messages.some((message) =>
          message.content.includes("terra decision question"),
        ),
      ).toBe(true);
      expect(writing?.messages[0]?.content).toContain("EXPERIMENTAL. Not production.");
      expect(split.markdown).toContain("terra decision question");
      expect(split.markdown).toContain("luna writing note");
      expect(split.markdown).toContain("production decision question");
      expect(split.markdown).toContain("production lean plan");
      expect(split.markdown).toContain("gpt-5.6-luna plan");
      expect(split.markdown).toContain("Reasoning tokens");
      expect(split.markdown).toContain("128");
      expect(split.markdown).toContain("EXPERIMENTAL. Not production.");
      expect(split.markdown).toContain("Split total:");
      expect(split.markdown).toContain(
        "Reasoning tokens are part of billed output tokens.",
      );

      const outputOnly = estimateEventCostUsd(
        {
          provider: "openai-responses",
          model: "gpt-5.6-terra",
          inputTokens: 1000,
          cachedInputTokens: 10,
          cacheWriteTokens: 5,
          outputTokens: 200,
          webSearchCalls: 0,
          occurredAt: new Date(),
        },
        SEED_AI_MODEL_RATES,
      );
      const outputPlusReasoning = estimateEventCostUsd(
        {
          provider: "openai-responses",
          model: "gpt-5.6-terra",
          inputTokens: 1000,
          cachedInputTokens: 10,
          cacheWriteTokens: 5,
          outputTokens: 328,
          webSearchCalls: 0,
          occurredAt: new Date(),
        },
        SEED_AI_MODEL_RATES,
      );
      expect(split.markdown).toContain(`$${outputOnly.toFixed(6)}`);
      expect(split.markdown).not.toContain(`$${outputPlusReasoning.toFixed(6)}`);
      const splitVariant = split.steps[0]?.planningVariants?.find(
        (variant) => variant.id === "split",
      );
      expect(splitVariant?.calls.map((call) => call.model)).toEqual([
        "gpt-5.6-terra",
        "gpt-5.6-luna",
      ]);
      expect(splitVariant?.calls[0]?.usage.reasoningTokens).toBe(128);
      expect(splitVariant?.calls[0]?.usage.outputTokens).toBe(200);
      expect(splitVariant?.calls).toHaveLength(2);

      expect(split.steps[0]?.planningVariants?.map((variant) => variant.id)).toEqual([
        "terra-today",
        "split",
        "luna-today",
        "lean-split",
      ]);
      const leanDecisionCall = calls[5];
      const leanWritingCall = calls[6];
      expect(leanWritingCall?.role).toBe("consultation_reply");
      expect(leanWritingCall?.model).toBe("gpt-5.6-luna");
      expect(leanDecisionCall?.model).toBe("gpt-5.6-terra");
      const leanDecisionJson = zodToOpenAiStrictJsonSchema(
        leanDecisionCall?.schema as Parameters<typeof zodToOpenAiStrictJsonSchema>[0],
      );
      const leanDecisionProperties =
        leanDecisionJson.properties && typeof leanDecisionJson.properties === "object"
          ? (leanDecisionJson.properties as Record<string, unknown>)
          : {};
      expect(Object.keys(leanDecisionProperties)).toEqual([
        "assessments",
        "questions",
      ]);
      expect(itemPropertyNames(leanDecisionProperties.assessments).sort()).toEqual([
        "strategyMode",
        "strength",
        "targetKey",
      ]);
      expect(itemPropertyNames(leanDecisionProperties.questions).sort()).toEqual([
        "hiringTeamRoleId",
        "interviewTypeTag",
        "targetKey",
        "text",
      ]);
      expect(
        leanWritingCall?.messages.some((message) =>
          message.content.includes("lean decision question"),
        ),
      ).toBe(true);
      const lean = split.steps[0]?.planningVariants?.find(
        (variant) => variant.id === "lean-split",
      );
      expect(lean?.label).toBe(
        "Lean split: terra questions and strengths, then luna",
      );
      expect(lean?.calls.map((call) => call.label)).toEqual([
        "Lean decision",
        "Lean writing",
      ]);
      expect(lean?.costUsd).toBeCloseTo(
        (lean?.calls[0]?.costUsd ?? 0) + (lean?.calls[1]?.costUsd ?? 0),
      );
      expect(lean?.output).toContain("1. lean decision question");
      expect(lean?.output).toContain("gap-1: PARTIAL (PROVE_WITH_STORY)");
      expect(lean?.output).toContain("Fact ids: skill_profile_marker");
      expect(lean?.output).toContain("Role ids: role_profile_marker");
      expect(lean?.output).not.toMatch(/Fact ids:.*invented-fact/);
      expect(lean?.output).not.toMatch(/Role ids:.*invented-role/);
      expect(lean?.output).toContain("lean writing note");
      expect(lean?.output).toContain(
        "Restored question gap-1 text from the decision (rejected rewritten question).",
      );
      expect(lean?.output).toContain(
        "Restored question gap-1 hiringTeamRoleId from the decision (rejected other-role).",
      );
      expect(lean?.output).toContain(
        "Restored question gap-1 interviewTypeTag from the decision (rejected screening).",
      );
      expect(lean?.output).toContain(
        "Restored assessment gap-1 strength from the decision (rejected NONE).",
      );
      expect(lean?.output).toContain(
        "Restored assessment gap-1 strategyMode from the decision (rejected ACKNOWLEDGE).",
      );
      expect(lean?.output).toContain(
        "Dropped supportingFactIds for gap-1 not in the supplied ids: invented-fact.",
      );
      expect(lean?.output).toContain(
        "Ignored question not-in-decision because it is not in the decision.",
      );
      expect(split.markdown).toContain("Today's terra total:");
      expect(split.markdown).toContain(
        `Lean split total: $${(lean?.costUsd ?? 0).toFixed(6)}`,
      );
      expect(split.markdown).toContain("EXPERIMENTAL. Not production.");
      expect(split.markdown).toContain(
        "You decide strengths and questions only.",
      );
      const { consultationPlanSchema } = await import(
        "@/lib/consultation/contract"
      );
      const { combineLeanDecisionAndWriting, suppliedEvidenceIds } =
        await import("@/lib/model-comparison/plan-split-experiment");
      const suppliedIds = suppliedEvidenceIds(
        (leanWritingCall?.messages ?? []).flatMap((message) =>
          message.role === "system" ||
          message.role === "user" ||
          message.role === "assistant"
            ? [{ role: message.role, content: message.content }]
            : [],
        ),
      );
      const combined = combineLeanDecisionAndWriting({
        decision: {
          assessments: [
            {
              targetKey: "gap-1",
              strength: "PARTIAL",
              strategyMode: "PROVE_WITH_STORY",
            },
          ],
          questions: [
            {
              targetKey: "gap-1",
              text: "lean decision question",
              hiringTeamRoleId: "role-ht",
              interviewTypeTag: "focused_competency",
            },
          ],
        },
        writingRaw: {
          overall: "You stand well for this job.",
          strongestAngles: ["Angle one", "Angle two"],
          importantGaps: ["A gap remains."],
          commentary: "lean writing note",
          closingNote: null,
          assessments: [
            {
              targetKey: "gap-1",
              strength: "NONE",
              strategyMode: "ACKNOWLEDGE",
              supportingFactIds: ["skill_profile_marker", "invented-fact"],
              relevantRoleIds: ["role_profile_marker", "invented-role"],
              explanation: "Partial evidence.",
              strategy: "Prove it with the payroll story.",
            },
          ],
          questions: [
            {
              targetKey: "gap-1",
              text: "rewritten question",
              hiringTeamRoleId: "other-role",
              interviewTypeTag: "screening",
              whoCaresNote: "The hiring manager needs this.",
              requirementInterpretation: null,
            },
          ],
        },
        suppliedFactIds: suppliedIds.factIds,
        suppliedRoleIds: suppliedIds.roleIds,
      });
      expect(consultationPlanSchema.safeParse(combined.plan).success).toBe(true);
      expect(combined.plan?.questions[0]?.text).toBe("lean decision question");
      expect(combined.plan?.assessments[0]?.strength).toBe("PARTIAL");
      expect(combined.plan?.assessments[0]?.strategyMode).toBe("PROVE_WITH_STORY");
      expect(combined.plan?.questions[0]?.hiringTeamRoleId).toBe("role-ht");
      expect(combined.plan?.questions[0]?.interviewTypeTag).toBe(
        "focused_competency",
      );
      expect(combined.plan?.briefing.storyPlan).toEqual([]);
    });
  },
);

const RENDER_COMMAND_FRAGMENT =
  "tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId>";
