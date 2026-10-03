import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CONSULTATION_COACH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { ROLE_EXPERTISE_QUESTIONS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
import { hasTestDatabase } from "@/test/database";

const calls = vi.hoisted(() => [] as Array<{
  model: string;
  role: string;
  schemaName?: string;
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
      usage?: unknown;
      webSearchEnabled?: boolean;
      messages: Array<{ role: string; content: string }>;
    }) {
      calls.push({
        model: config.model,
        role: config.role,
        schemaName: request.schemaName,
        usage: request.usage,
        webSearchEnabled: request.webSearchEnabled,
        messages: request.messages,
      });
      const stamp = config.model;
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

function tokenUsage(webSearch: boolean) {
  return {
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 10,
    cacheWriteTokens: 5,
    webSearchCalls: webSearch ? 3 : 0,
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

      for (const prefix of ["CONSULTATION_AI", "RESEARCH_AI"]) {
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
        "consultation_plan",
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

      const planning = calls.find((call) => call.schemaName === "consultation_plan");
      expect(planning?.messages[0]?.content).toContain(
        CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
      );
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

      expect(report.markdown).toContain("gpt-5.6-terra plan");
      expect(report.markdown).toContain("gpt-5.6-luna plan");
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
  },
);

const RENDER_COMMAND_FRAGMENT =
  "tsx --conditions=react-server scripts/compare-models.ts --campaign <campaignId>";
