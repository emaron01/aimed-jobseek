import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import { buildTargetedSearchFocus } from "@/lib/research/sufficiency";
import {
  anchorHostEvidenceEnough,
  employerSearchBudget,
  shouldRunAnotherEmployerSearch,
} from "@/lib/research/source-policy";
import type { ResearchSource } from "@/lib/research/types";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import { withTestTenant } from "@/test/with-test-tenant";

const SALES_PROSPECTING = [
  "products sold",
  "buyer segments",
  "risk or churn",
  "deal size",
  "deal sizes",
  "churn risk",
  "fit score",
  "fit scores",
];

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    sourceType: "OTHER",
    retrievedAt: new Date().toISOString(),
    supports: ["companySummary"],
    ...partial,
  };
}

describe("tailored application research brief and search", () => {
  it("uses the approved brief and does not ask follow-up for sales-prospecting", () => {
    const messages = buildCompanyResearchMessages({
      company: {
        organizationId: "org",
        companyId: "co",
        name: "CSC",
        website: "https://cscglobal.com",
        normalizedDomain: "cscglobal.com",
        industry: null,
        employeeCount: null,
        location: null,
        seekerSuppliedNotes: "About page notes",
        postingTitle: "Senior Director of Sales",
        postingUrl: "https://www.cscglobal.com/careers/senior-director-of-sales",
        postingText:
          "Sell digital brand protection, domain, and digital-risk services to enterprise buyers.",
      },
      evidence: { sources: [], excerpts: [] },
      webSearchEnabled: true,
      stage: "follow_up",
      searchFocus: buildTargetedSearchFocus(
        ["whatTheySell", "customerTypes", "businessModel", "riskSignals"],
        ["buyingSignals", "estimatedAov"],
      ),
    });
    expect(messages[0]?.content).toBe(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS);
    const user = JSON.parse(String(messages[1]?.content ?? "{}")) as {
      searchFocus: string | null;
      posting: { title: string; url: string; text: string };
      seekerSuppliedNotes: string;
      company: { website: string };
    };
    expect(user.company.website).toBe("https://cscglobal.com");
    expect(user.seekerSuppliedNotes).toBe("About page notes");
    expect(user.posting.text).toContain("digital brand protection");
    const focus = (user.searchFocus ?? "").toLowerCase();
    for (const phrase of SALES_PROSPECTING) {
      expect(focus).not.toContain(phrase);
    }
    const empty = buildTargetedSearchFocus([], []).toLowerCase();
    for (const phrase of SALES_PROSPECTING) {
      expect(empty).not.toContain(phrase);
    }
  });

  it("keeps the anchor host and approved news that names the company or its business", () => {
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://cscglobal.com",
      companyDomain: "cscglobal.com",
      companyName: "CSC",
      jobFocus: "digital brand protection",
      maxSources: 8,
      excerpts: [
        {
          url: "https://www.bloomberg.com/news/csc-risk",
          title: "Markets",
          text: "CSC's digital brand protection unit expanded.",
        },
      ],
      sources: [
        source({
          url: "https://www.cscglobal.com/about",
          sourceType: "COMPANY_WEBSITE",
          supports: ["companySummary"],
        }),
        source({
          url: "https://jobs.cscglobal.com/careers",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
        source({
          url: "https://www.reuters.com/business/csc",
          title: "CSC updates digital brand protection",
          sourceType: "NEWS",
          supports: ["jobFocus"],
        }),
        source({
          url: "https://www.bloomberg.com/news/csc-risk",
          title: "Markets",
          sourceType: "NEWS",
          supports: ["jobFocusDetail"],
        }),
        source({
          url: "https://www.reuters.com/business/other",
          title: "Unrelated markets column",
          sourceType: "NEWS",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.gofundme.com/acme",
          title: "CSC fundraiser",
          sourceType: "OTHER",
          supports: ["companySummary"],
        }),
        source({
          url: "https://oneweekendai.com/northline",
          title: "Northline at One Weekend AI",
          sourceType: "NEWS",
          supports: ["companySummary"],
        }),
        source({
          url: "https://thenorthlineinstitute.com/about",
          title: "The Northline Institute",
          sourceType: "COMPANY_WEBSITE",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized.map((row) => row.url).sort()).toEqual(
      [
        "https://jobs.cscglobal.com/careers",
        "https://www.bloomberg.com/news/csc-risk",
        "https://www.cscglobal.com/about",
        "https://www.reuters.com/business/csc",
      ].sort(),
    );
  });

  it("stops searching once anchor-host evidence is enough and never exceeds 3", () => {
    expect(employerSearchBudget(10)).toBe(3);
    const enough = anchorHostEvidenceEnough({
      anchorHost: "cscglobal.com",
      companySummary: "CSC provides domain and digital-risk services.",
      whatTheySell: "Digital brand protection",
      jobFocus: "digital brand protection, domain, and digital-risk",
      jobFocusDetail: "The sales role serves that business.",
      postingProvided: true,
      sources: [
        source({
          url: "https://www.cscglobal.com/services",
          supports: ["companySummary", "jobFocus", "jobFocusDetail"],
        }),
      ],
    });
    expect(enough).toBe(true);
    expect(
      anchorHostEvidenceEnough({
        anchorHost: "cscglobal.com",
        companySummary: "CSC provides domain and digital-risk services.",
        whatTheySell: null,
        jobFocus: null,
        jobFocusDetail: null,
        postingProvided: true,
        sources: [
          source({
            url: "https://www.gofundme.com/csc",
            supports: ["companySummary"],
          }),
        ],
      }),
    ).toBe(false);

    let early = 0;
    let earlyEnough = false;
    while (
      shouldRunAnotherEmployerSearch({
        searchesUsed: early,
        budget: employerSearchBudget(3),
        enough: earlyEnough,
      })
    ) {
      early += 1;
      earlyEnough = true;
    }
    expect(early).toBe(1);

    let capped = 0;
    while (
      shouldRunAnotherEmployerSearch({
        searchesUsed: capped,
        budget: employerSearchBudget(9),
        enough: false,
      })
    ) {
      capped += 1;
    }
    expect(capped).toBe(3);
    expect(readFileSync("src/lib/research/provider.ts", "utf8")).toContain(
      "shouldRunAnotherEmployerSearch",
    );
  });

  it("does not run research from an application page view", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    expect(workspace).not.toContain("researchCompany(");
    expect(workspace).not.toContain("runPaidStructuredCall");
    expect(workspace).not.toContain("enqueueApplicationResearch");
  });
});

describe.skipIf(!hasTestDatabase())(
  "tailored application research storage",
  { timeout: 60_000 },
  () => {
    const suffix = `tar-${Date.now().toString(36)}`;
    let organizationId = "";
    let userId = "";
    let productId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] TAR ${suffix}`, slug: `tar-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `tar-${suffix}@example.test`,
          emailNormalized: `tar-${suffix}@example.test`,
          emailVerifiedAt: new Date(),
        },
      });
      userId = user.id;
      await prisma.organizationMembership.create({
        data: { organizationId, userId, role: "OWNER" },
      });
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          approvalStatus: "APPROVED",
        },
      });
      productId = product.id;
    });

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    async function application(input: {
      name: string;
      rawText: string;
      notes: string;
    }) {
      const company = await prisma.company.create({
        data: {
          organizationId,
          name: input.name,
          normalizedName: input.name.toLowerCase().replace(/\s+/g, "-"),
          website: `https://csc-${suffix}.example`,
          normalizedDomain: `csc-${suffix}.example`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: input.name,
          productId,
          companyResearchNotes: input.notes,
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          companyId: company.id,
          rawText: input.rawText,
          title: "Senior Director of Sales",
          postingUrl: "https://www.cscglobal.com/careers/senior-director-of-sales",
          companyName: input.name,
          suppliedEmployerWebsite: `https://csc-${suffix}.example`,
          employerDisposition: "IDENTIFIED",
          scorecardJson: { mission: null, outcomes: [], competencies: [] },
        },
      });
      return { company, campaign };
    }

    it("stores one tailored result per application and reruns only when the fingerprint changes", async () => {
      const notes = "About page: CSC sells domain and digital-risk services.";
      const posting =
        "Senior Director of Sales. Sell digital brand protection, domain, and digital-risk services.";
      const { company, campaign } = await application({
        name: `CSC ${suffix}`,
        rawText: posting,
        notes,
      });
      const other = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: userId,
          name: `Other ${suffix}`,
          productId,
          companyResearchNotes: notes,
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: other.id,
          companyId: company.id,
          rawText: "A different posting for a different application.",
          title: "Director of Support",
          postingUrl: "https://www.cscglobal.com/careers/director-of-support",
          companyName: company.name,
          suppliedEmployerWebsite: `https://csc-${suffix}.example`,
          employerDisposition: "IDENTIFIED",
          scorecardJson: { mission: null, outcomes: [], competencies: [] },
        },
      });

      process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
      process.env.RESEARCH_AI_MODEL = "research-model";
      process.env.RESEARCH_AI_MODEL_URL =
        "https://research.example/v1/chat/completions";
      process.env.RESEARCH_AI_API_KEY = "research-key";
      const { setCompanyResearchProvider } = await import("@/lib/research/provider");
      const { researchCompany } = await import("@/lib/tenant/company-research-service");
      const paid = await import("@/lib/ai/paid-call-gate");
      const paidCall = vi.spyOn(paid, "runPaidStructuredCall");
      let calls = 0;
      let seen: {
        website?: string | null;
        postingTitle?: string | null;
        postingUrl?: string | null;
        postingText?: string | null;
        seekerSuppliedNotes?: string | null;
      } | null = null;
      setCompanyResearchProvider({
        async research(input) {
          calls += 1;
          seen = input;
          return {
            companySummary: "CSC provides domain, brand, and digital-risk services.",
            whatTheySell: "Digital brand protection, domain, and digital-risk services.",
            customerTypes: ["Enterprise"],
            primaryMarkets: [],
            businessModel: null,
            estimatedAov: null,
            aovReasoning: null,
            companySizeContext: null,
            relevantTechnologies: [],
            buyingSignals: [],
            hiringSignals: [],
            riskSignals: [],
            jobFocus: "digital brand protection, domain, and digital-risk",
            jobFocusDetail:
              "This sales role serves CSC's digital brand protection, domain, and digital-risk business.",
            confidence: "HIGH",
            sources: [
              {
                url: `https://csc-${suffix}.example/services`,
                sourceType: "COMPANY_WEBSITE",
                retrievedAt: new Date().toISOString(),
                supports: ["companySummary", "whatTheySell", "jobFocus", "jobFocusDetail"],
              },
            ],
          };
        },
      });
      try {
        const first = await withTestTenant(organizationId, () =>
          researchCompany(company.id, {
            campaignId: campaign.id,
            anchorWebsite: `https://csc-${suffix}.example`,
            seekerSuppliedNotes: notes,
          }),
        );
        expect(first.skipped, first.reason).toBe(false);
        expect(calls).toBe(1);
        expect(seen).toMatchObject({
          website: `https://csc-${suffix}.example`,
          postingTitle: "Senior Director of Sales",
          postingUrl: "https://www.cscglobal.com/careers/senior-director-of-sales",
          postingText: posting,
          seekerSuppliedNotes: notes,
        });
        const stored = await prisma.applicationEmployerResearch.findFirstOrThrow({
          where: { campaignId: campaign.id },
        });
        expect(stored.companySummary).toContain("domain");
        expect(stored.jobFocus).toContain("digital brand protection");
        expect(stored.jobFocus).toContain("domain");
        expect(stored.jobFocus).toContain("digital-risk");
        expect(stored.jobFocusDetail).toContain("digital brand protection");
        expect(
          await prisma.companyResearch.count({ where: { companyId: company.id } }),
        ).toBe(0);

        paidCall.mockClear();
        const again = await withTestTenant(organizationId, () =>
          researchCompany(company.id, {
            campaignId: campaign.id,
            anchorWebsite: `https://csc-${suffix}.example`,
            seekerSuppliedNotes: notes,
          }),
        );
        expect(again.skipped).toBe(true);
        expect(again.reason).toBe("unchanged");
        expect(calls).toBe(1);
        expect(paidCall).not.toHaveBeenCalled();

        const changedNotes = await withTestTenant(organizationId, () =>
          researchCompany(company.id, {
            campaignId: campaign.id,
            anchorWebsite: `https://csc-${suffix}.example`,
            seekerSuppliedNotes: "Updated notes about the domain business.",
          }),
        );
        expect(changedNotes.skipped).toBe(false);
        expect(calls).toBe(2);

        await prisma.jobRequirement.update({
          where: { campaignId: campaign.id },
          data: { rawText: `${posting} Now includes a new region.` },
        });
        const changedPosting = await withTestTenant(organizationId, () =>
          researchCompany(company.id, {
            campaignId: campaign.id,
            anchorWebsite: `https://csc-${suffix}.example`,
            seekerSuppliedNotes: "Updated notes about the domain business.",
          }),
        );
        expect(changedPosting.skipped).toBe(false);
        expect(calls).toBe(3);

        const secondApp = await withTestTenant(organizationId, () =>
          researchCompany(company.id, {
            campaignId: other.id,
            anchorWebsite: `https://csc-${suffix}.example`,
            seekerSuppliedNotes: notes,
          }),
        );
        expect(secondApp.skipped).toBe(false);
        expect(calls).toBe(4);
        const rows = await prisma.applicationEmployerResearch.findMany({
          where: { companyId: company.id },
        });
        expect([...new Set(rows.map((row) => row.campaignId))].sort()).toEqual(
          [campaign.id, other.id].sort(),
        );
        const original = rows.find((row) => row.campaignId === campaign.id);
        expect(original?.jobFocus).toContain("digital brand protection");
      } finally {
        setCompanyResearchProvider(null);
        paidCall.mockRestore();
      }
    });
  },
);
