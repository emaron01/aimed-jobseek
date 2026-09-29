import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COMPANY_RESEARCH_OPERATION,
  COMPANY_RESEARCH_UNCHANGED_MESSAGE,
  COMPANY_RESEARCH_UNCHANGED_REASON,
  companyResearchFingerprint,
  companyResearchSubjectKey,
  runGatedCompanyResearch,
} from "@/lib/research/company-research-paid-inputs";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { structuredOutputRequest } from "@/lib/ai/structured-output-schemas";
import { applicationResearchCopy } from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import { withTestTenant } from "@/test/with-test-tenant";

const depth = {
  maxSearchQueriesPerCompany: 3,
  maxSourcesPerCompany: 8,
  researchFreshnessDays: 90,
};

describe("company research fingerprint gate (source)", () => {
  it("fingerprint is stable for identical identity, notes, versions, and depth", () => {
    const a = companyResearchFingerprint({
      name: "Acme Robotics",
      website: "https://acme.example",
      normalizedDomain: "acme.example",
      industry: "Robotics",
      employeeCount: 120,
      location: "Austin, TX",
      seekerSuppliedNotes: "Uses ROS",
      depthPolicy: depth,
      evidenceTargets: ["hiringSignals"],
    });
    const b = companyResearchFingerprint({
      name: "Acme Robotics",
      website: "https://acme.example",
      normalizedDomain: "acme.example",
      industry: "Robotics",
      employeeCount: 120,
      location: "Austin, TX",
      seekerSuppliedNotes: "Uses ROS",
      depthPolicy: depth,
      evidenceTargets: ["hiringSignals"],
    });
    expect(a).toBe(b);
    expect(a).toBe(
      fingerprintPaidCallInputs({
        promptVersion: RESEARCH_PROMPT_VERSION,
        schemaName: structuredOutputRequest("companyResearch").schemaName,
        name: "Acme Robotics",
        website: "https://acme.example",
        normalizedDomain: "acme.example",
        industry: "Robotics",
        employeeCount: 120,
        location: "Austin, TX",
        seekerSuppliedNotes: "Uses ROS",
        depthPolicy: depth,
        evidenceTargets: ["hiringSignals"],
      }),
    );
  });

  it("fingerprint changes when seeker notes change", () => {
    const base = {
      name: "Acme",
      website: null as string | null,
      normalizedDomain: null as string | null,
      industry: null as string | null,
      employeeCount: null as number | null,
      location: null as string | null,
      depthPolicy: depth,
    };
    expect(
      companyResearchFingerprint({ ...base, seekerSuppliedNotes: "a" }),
    ).not.toBe(
      companyResearchFingerprint({ ...base, seekerSuppliedNotes: "b" }),
    );
  });

  it("wires gate into researchCompany and retry message into the action", () => {
    const service = readFileSync(
      "src/lib/tenant/company-research-service.ts",
      "utf8",
    );
    expect(service).toContain("runGatedCompanyResearch");
    expect(service).toContain("companyResearchFingerprint");
    expect(service).toContain("COMPANY_RESEARCH_UNCHANGED_REASON");
    expect(service).toContain("options?.force");

    const gate = readFileSync("src/lib/ai/paid-call-gate.ts", "utf8");
    expect(gate).toContain("pg_try_advisory_lock");
    expect(gate).toContain("paidCallLockDatabaseUrl");
    expect(gate).toContain("connection_limit");
    expect(gate).not.toContain("pg_advisory_xact_lock");
    expect(gate).not.toContain("subjectLocks");
    expect(gate).not.toMatch(/\$transaction\s*\(/);

    const actions = readFileSync("src/app/actions/application.ts", "utf8");
    expect(actions).toContain("skippedUnchanged");
    expect(actions).toContain("applicationResearchCopy.unchanged");
    expect(applicationResearchCopy.unchanged).toBe(
      COMPANY_RESEARCH_UNCHANGED_MESSAGE,
    );
    expect(COMPANY_RESEARCH_UNCHANGED_MESSAGE).toBe(
      "No Changes To Company Research",
    );

    const appService = readFileSync("src/lib/application/service.ts", "utf8");
    expect(appService).toContain("companyResearchFingerprintUnchanged");
    expect(appService).toContain("forceRefresh: true");
    const confirmBlock = appService.slice(
      appService.indexOf("export async function confirmApplicationEmployerIdentity"),
      appService.indexOf("export async function rejectApplicationEmployerIdentity"),
    );
    const rejectBlock = appService.slice(
      appService.indexOf("export async function rejectApplicationEmployerIdentity"),
      appService.indexOf("export async function saveApplicationCompanyResearchNotes"),
    );
    expect(confirmBlock).not.toContain("queueApplicationResearch");
    expect(rejectBlock).not.toContain("queueApplicationResearch");

    expect(
      companyResearchSubjectKey("org_1", "co_1"),
    ).toBe("org_1:co_1");
    expect(COMPANY_RESEARCH_OPERATION).toBe("COMPANY_RESEARCH");
  });

  it("page views and confirm/reject still do not enqueue research", () => {
    const noAi = readFileSync(
      "src/lib/application/no-ai-on-view.test.ts",
      "utf8",
    );
    expect(noAi).toContain("queueApplicationResearch");
    expect(noAi).toContain("enqueueApplicationResearch");
    const workspace = readFileSync(
      "src/components/ApplicationWorkspace.tsx",
      "utf8",
    );
    expect(workspace).not.toContain("enqueueApplicationResearch");
    expect(workspace).not.toContain("researchCompany(");
  });
});

describe.skipIf(!hasTestDatabase())(
  "company research fingerprint gate (database)",
  { timeout: 60_000 },
  () => {
    const suffix = `crg-${Date.now().toString(36)}`;
    let organizationId = "";
    let userId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] CRG ${suffix}`, slug: `crg-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `crg-${suffix}@example.test`,
          emailNormalized: `crg-${suffix}@example.test`,
          emailVerifiedAt: new Date(),
        },
      });
      userId = user.id;
      await prisma.organizationMembership.create({
        data: {
          organizationId,
          userId,
          role: "OWNER",
        },
      });
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("concurrent gated calls for the same company make one provider call", async () => {
      let calls = 0;
      const fingerprint = companyResearchFingerprint({
        name: "Concurrent Co",
        website: null,
        normalizedDomain: null,
        industry: null,
        employeeCount: null,
        location: null,
        seekerSuppliedNotes: null,
        depthPolicy: depth,
      });
      const companyId = `co-concurrent-${suffix}`;
      const callProvider = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return {
          companySummary: "Concurrent summary",
          whatTheySell: "Widgets",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          estimatedAov: null,
          aovReasoning: null,
          companySizeContext: null,
          relevantTechnologies: [],
          buyingSignals: [],
          hiringSignals: [],
          riskSignals: [],
          confidence: "HIGH" as const,
          sources: [],
        };
      };
      const [a, b] = await Promise.all([
        runGatedCompanyResearch({
          organizationId,
          companyId,
          fingerprint,
          callProvider,
        }),
        runGatedCompanyResearch({
          organizationId,
          companyId,
          fingerprint,
          callProvider,
        }),
      ]);
      expect(calls).toBe(1);
      expect(a.data.companySummary).toBe("Concurrent summary");
      expect(b.data.companySummary).toBe("Concurrent summary");
      expect(a.skipped || b.skipped).toBe(true);

      const third = await runGatedCompanyResearch({
        organizationId,
        companyId,
        fingerprint,
        callProvider,
      });
      expect(calls).toBe(1);
      expect(third.skipped).toBe(true);
    });

    it("force with unchanged fingerprint skips provider when usable research exists", async () => {
      process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
      process.env.RESEARCH_AI_MODEL = "research-model";
      process.env.RESEARCH_AI_MODEL_URL =
        "https://research.example/v1/chat/completions";
      process.env.RESEARCH_AI_API_KEY = "research-key";

      const {
        resolveOrCreateCompany,
        researchCompany,
      } = await import("@/lib/tenant/companies");
      const { setCompanyResearchProvider } = await import(
        "@/lib/research/provider"
      );
      const { getResearchPolicy } = await import("@/lib/usage/policy-service");

      let calls = 0;
      setCompanyResearchProvider({
        async research() {
          calls += 1;
          return {
            companySummary: "Usable summary",
            whatTheySell: "Software",
            customerTypes: [],
            primaryMarkets: [],
            businessModel: null,
            estimatedAov: null,
            aovReasoning: null,
            companySizeContext: null,
            relevantTechnologies: [],
            buyingSignals: [],
            hiringSignals: [],
            riskSignals: [],
            confidence: "HIGH",
            sources: [
              {
                url: "https://gate-co.example",
                sourceType: "COMPANY_WEBSITE",
                retrievedAt: new Date().toISOString(),
                supports: ["companySummary"],
              },
            ],
          };
        },
      });

      try {
        await withTestTenant(organizationId, async () => {
            const company = await resolveOrCreateCompany({
              name: `Gate Co ${suffix}`,
              website: "https://gate-co.example",
            });
            expect(company).not.toBeNull();

            const first = await researchCompany(company!.id, {
              seekerSuppliedNotes: "note-one",
            });
            expect(first.reason ?? null).toBeNull();
            expect(first.skipped).toBe(false);
            expect(calls).toBe(1);
            expect(first.research?.companySummary).toBe("Usable summary");

            const forcedSame = await researchCompany(company!.id, {
              force: true,
              seekerSuppliedNotes: "note-one",
            });
            expect(forcedSame.skipped).toBe(true);
            expect(forcedSame.reason).toBe(COMPANY_RESEARCH_UNCHANGED_REASON);
            expect(calls).toBe(1);
            expect(forcedSame.research?.companySummary).toBe("Usable summary");

            const forcedChanged = await researchCompany(company!.id, {
              force: true,
              seekerSuppliedNotes: "note-two",
            });
            expect(forcedChanged.skipped).toBe(false);
            expect(calls).toBe(2);

            const policy = await getResearchPolicy(organizationId);
            const fingerprint = companyResearchFingerprint({
              name: company!.name,
              website: company!.website,
              normalizedDomain: company!.normalizedDomain,
              industry: company!.industry,
              employeeCount: company!.employeeCount,
              location: company!.location,
              seekerSuppliedNotes: "note-two",
              depthPolicy: policy,
            });
            const receipt = await prisma.paidCallReceipt.findUnique({
              where: {
                organizationId_operation_subjectKey: {
                  organizationId,
                  operation: COMPANY_RESEARCH_OPERATION,
                  subjectKey: companyResearchSubjectKey(
                    organizationId,
                    company!.id,
                  ),
                },
              },
            });
            expect(receipt?.inputHash).toBe(fingerprint);
          }, userId);
      } finally {
        setCompanyResearchProvider(null);
      }
    });
  },
);
