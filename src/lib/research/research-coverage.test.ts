import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as ai from "@/lib/ai";
import type { AiConfig } from "@/lib/ai/config";
import type { AiProvider } from "@/lib/ai/types";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import { AiCompanyResearchProvider, setCompanyResearchProvider } from "@/lib/research/provider";
import {
  anchorHostEvidenceEnough,
  isHomepageResearchUrl,
  jobFocusDetailIsOnlyPosting,
} from "@/lib/research/source-policy";
import {
  getCompanySourceRetriever,
  retrieveWebsiteEvidence,
  selectJobFocusPageUrl,
  setCompanySourceRetriever,
  type RetrievedEvidenceBundle,
} from "@/lib/research/sources";
import type { CompanyResearchInput, ResearchSource } from "@/lib/research/types";
import { employerRisksForJobSeeker, validateCompanyResearchResult } from "@/lib/research/validate";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import { withTestTenant } from "@/test/with-test-tenant";

const HOME = "https://www.cscglobal.com/cscglobal/home/";
const BRAND = "https://www.cscglobal.com/solutions/domain-brand-security";
const POSTING =
  "Senior Director of Sales. The posting lists 500 employees and also 6,000 employees. The role requires 10 years of enterprise sales.";

const researchConfig: AiConfig = {
  role: "research",
  provider: "openai-responses",
  model: "gpt-5.6-luna",
  modelUrl: "https://api.openai.com/v1/responses",
  modelUrlIdentifier: "openai-responses",
  apiKey: "test-key",
  timeoutMs: 1000,
  maxRetries: 0,
  temperature: 0,
  reasoningEffort: null,
};

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    sourceType: "COMPANY_WEBSITE",
    retrievedAt: "2026-10-03T00:00:00.000Z",
    supports: [],
    ...partial,
  };
}

function coveredInput(overrides?: Partial<Parameters<typeof anchorHostEvidenceEnough>[0]>) {
  return {
    anchorHost: "cscglobal.com",
    companySummary: "CSC",
    whatTheySell: "Domain and brand security",
    jobFocus: "Domain and Brand Security",
    jobFocusDetail:
      "The Domain and Brand Security business sells brand monitoring to enterprises.",
    postingProvided: true,
    postingText: POSTING,
    sources: [
      source({
        url: BRAND,
        title: "Domain and Brand Security",
        supports: ["jobFocusDetail"],
      }),
    ],
    ...overrides,
  };
}

const baseInput: CompanyResearchInput = {
  organizationId: "org-coverage",
  companyId: "co-coverage",
  name: "CSC",
  website: HOME,
  normalizedDomain: "cscglobal.com",
  industry: null,
  employeeCount: null,
  location: null,
  postingTitle: "Senior Director of Sales",
  postingUrl: "https://www.cscglobal.com/careers/senior-director",
  postingText: POSTING,
  depthPolicy: {
    maxSearchQueriesPerCompany: 9,
    maxSourcesPerCompany: 8,
    researchFreshnessDays: 90,
  },
};

function aiPayload(input: {
  detail: string;
  sources: ResearchSource[];
  retrieved?: Array<{ url: string; title: string }>;
}) {
  return {
    data: {
      companySummary: "CSC provides domain and brand security.",
      whatTheySell: "Domain and brand security",
      customerTypes: [] as string[],
      primaryMarkets: [] as string[],
      businessModel: null,
      companySizeContext: null,
      relevantTechnologies: [] as string[],
      hiringSignals: [] as string[],
      riskSignals: [
        "Inconsistent workforce figures: the posting lists 500 employees and also 6,000.",
        "The role requires 10 years of enterprise sales.",
        "CSC announced layoffs in the brand security unit in 2025.",
      ],
      jobFocus: "Domain and Brand Security",
      jobFocusDetail: input.detail,
      confidence: "MEDIUM" as const,
      identityCertainty: "HIGH" as const,
      sources: input.sources,
    },
    rawText: "{}",
    provider: "openai-responses",
    model: "gpt-5.6-luna",
    modelUrlIdentifier: "openai-responses",
    retrievedSources: input.retrieved ?? [],
  };
}

describe("research coverage before stopping", () => {
  const previousRetriever = getCompanySourceRetriever();

  afterEach(() => {
    setCompanySourceRetriever(previousRetriever);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not treat the homepage, or the posting text alone, as coverage", () => {
    expect(isHomepageResearchUrl(HOME)).toBe(true);
    expect(isHomepageResearchUrl(BRAND)).toBe(false);
    expect(
      anchorHostEvidenceEnough({
        anchorHost: "cscglobal.com",
        companySummary: "CSC provides corporate services.",
        whatTheySell: "Corporate services",
        jobFocus: "Domain and Brand Security",
        jobFocusDetail: "Domain and Brand Security is a CSC business.",
        postingProvided: true,
        postingText: POSTING,
        sources: [
          source({
            url: HOME,
            title: "CSC Global",
            supports: ["companySummary", "whatTheySell", "jobFocus", "jobFocusDetail"],
          }),
        ],
      }),
    ).toBe(false);

    expect(jobFocusDetailIsOnlyPosting(POSTING, POSTING)).toBe(true);
    expect(
      anchorHostEvidenceEnough(
        coveredInput({
          jobFocusDetail: POSTING,
          sources: [
            source({
              url: BRAND,
              title:
                "CEO announced 2026 results. Public ownership. Competitors include MarkMonitor.",
              supports: ["companySummary", "jobFocusDetail"],
            }),
          ],
        }),
      ),
    ).toBe(false);
  });

  it("stops once a job-focus page and the four highlight topics are covered", () => {
    const supported = coveredInput({
      sources: [
        source({
          url: BRAND,
          title:
            "CEO announced 2026 results. Public ownership. Competitors include MarkMonitor.",
          supports: ["companySummary", "jobFocusDetail"],
        }),
      ],
    });
    expect(anchorHostEvidenceEnough(supported)).toBe(true);
    expect(
      anchorHostEvidenceEnough(
        coveredInput({
          topicsRecordedNotFound: [
            "leadership",
            "recentNews",
            "ownershipOrFinancialHealth",
            "competitors",
          ],
        }),
      ),
    ).toBe(true);
  });

  it("selects the anchor-host page linked from the homepage for that business", () => {
    const html = `
      <a href="/cscglobal/home/">Home</a>
      <a href="/solutions/domain-brand-security">Domain and Brand Security</a>
      <a href="https://www.reuters.com/csc">News</a>
    `;
    expect(
      selectJobFocusPageUrl({
        html,
        pageUrl: HOME,
        anchorHost: "cscglobal.com",
        subject: "Domain and Brand Security",
      }),
    ).toBe(BRAND);
  });

  it("fetches and keeps the job-focus page inside the website evidence", async () => {
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const href = String(url);
      if (href.includes("domain-brand-security")) {
        return new Response(
          `<html><head><title>Domain and Brand Security</title></head><body>${"Brand security services for enterprises. ".repeat(20)}</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (href.includes("/cscglobal/home")) {
        return new Response(
          `<html><head><title>CSC</title></head><body><a href="/solutions/domain-brand-security">Domain and Brand Security</a><p>${"Corporate services home. ".repeat(30)}</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("missing", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    });

    const bundle = await retrieveWebsiteEvidence({
      ...baseInput,
      postingText: "Senior Director of Sales for Domain and Brand Security.",
    });
    const page = bundle.excerpts.find((excerpt) =>
      excerpt.url.includes("domain-brand-security"),
    );
    expect(page?.text).toContain("Brand security");
  });

  it("drops posting inconsistencies and job requirements from employer risk", () => {
    const risks = employerRisksForJobSeeker(
      [
        "Inconsistent workforce figures: the posting lists 500 employees and also 6,000.",
        "The role requires 10 years of enterprise sales.",
        "The job demands a standing quota.",
        "CSC announced layoffs in the brand security unit in 2025. The CEO resigned in March 2026.",
      ],
      POSTING,
    );
    expect(risks).toEqual([
      "CSC announced layoffs in the brand security unit in 2025. The CEO resigned in March 2026.",
    ]);

    const evidence: RetrievedEvidenceBundle = {
      sources: [
        source({
          url: BRAND,
          supports: ["riskSignals"],
        }),
      ],
      excerpts: [],
    };
    const validated = validateCompanyResearchResult(
      {
        companySummary: "CSC",
        whatTheySell: "Domain security",
        customerTypes: [],
        primaryMarkets: [],
        businessModel: null,
        companySizeContext: null,
        relevantTechnologies: [],
        hiringSignals: [],
        riskSignals: [
          "Must have 10 years of experience.",
          "A securities lawsuit was filed against CSC in 2025.",
        ],
        jobFocus: "Domain and Brand Security",
        jobFocusDetail: "Brand monitoring.",
        confidence: "MEDIUM",
        sources: [
          {
            url: BRAND,
            title: "Domain and Brand Security",
            publisher: null,
            sourceType: "COMPANY_WEBSITE",
            retrievedAt: "2026-10-03T00:00:00.000Z",
            supports: ["companySummary", "riskSignals"],
          },
        ],
      },
      evidence,
      { postingText: POSTING },
    );
    expect(validated.riskSignals).toEqual([
      "A securities lawsuit was filed against CSC in 2025.",
    ]);
  });

  it("keeps the same source allowlist", () => {
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://cscglobal.com",
      companyDomain: "cscglobal.com",
      companyName: "CSC",
      jobFocus: "digital brand protection",
      maxSources: 8,
      sources: [
        source({
          url: "https://www.cscglobal.com/about",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.gofundme.com/csc",
          title: "CSC fundraiser",
          sourceType: "OTHER",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.reuters.com/business/csc",
          title: "CSC updates digital brand protection",
          sourceType: "NEWS",
          supports: ["jobFocus"],
        }),
        source({
          url: "https://oneweekendai.com/northline",
          title: "Northline lookalike",
          sourceType: "OTHER",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized.map((row) => row.url).sort()).toEqual(
      [
        "https://www.cscglobal.com/about",
        "https://www.reuters.com/business/csc",
      ].sort(),
    );
  });

  it("does not run research from an application page view", () => {
    for (const file of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationCompanyBriefing.tsx",
    ]) {
      const page = readFileSync(file, "utf8");
      expect(page).not.toContain("researchCompany(");
      expect(page).not.toContain("enqueueApplicationResearch");
      expect(page).not.toContain("runPaidStructuredCall");
    }
  });

  it("decides a matching fingerprint before the provider is called", () => {
    const service = readFileSync(
      "src/lib/tenant/company-research-service.ts",
      "utf8",
    );
    const skip = service.indexOf(
      "if (applicationResearchIsReusable(stored, fingerprint))",
    );
    const providerCall = service.indexOf("provider.research(");
    expect(skip).toBeGreaterThan(-1);
    expect(providerCall).toBeGreaterThan(skip);
  });

  async function runProvider(
    retriever: RetrievedEvidenceBundle,
    respond: (call: number, request: { webSearchEnabled?: boolean; messages?: Array<{ content: string }> }) => ReturnType<typeof aiPayload>,
  ) {
    setCompanySourceRetriever({
      async retrieve() {
        return retriever;
      },
    });
    vi.spyOn(ai, "getResearchAiConfig").mockReturnValue(researchConfig);
    const calls: Array<{ webSearchEnabled?: boolean; messages?: Array<{ content: string }> }> = [];
    const provider = {
      async generateStructured(request: {
        webSearchEnabled?: boolean;
        messages?: Array<{ content: string }>;
      }) {
        calls.push(request);
        return respond(calls.length, request);
      },
    } as AiProvider;
    vi.spyOn(ai, "getResearchAiProvider").mockReturnValue(provider);
    const result = await new AiCompanyResearchProvider().research(baseInput);
    return { result, calls };
  }

  it("does not stop on the homepage alone and searches at least once, never more than 3", async () => {
    const homepageOnly: RetrievedEvidenceBundle = {
      sources: [source({ url: HOME, title: "CSC Global" })],
      excerpts: [{ url: HOME, title: "CSC Global", text: "CSC corporate home." }],
    };
    const thin = aiPayload({
      detail: POSTING,
      sources: [
        source({
          url: HOME,
          title: "CSC Global",
          supports: ["companySummary", "whatTheySell", "jobFocus", "jobFocusDetail"],
        }),
      ],
    });
    const { result, calls } = await runProvider(homepageOnly, () => thin);
    const searches = calls.filter((call) => call.webSearchEnabled);
    expect(searches.length).toBeGreaterThanOrEqual(1);
    expect(searches.length).toBe(3);
    expect(result.stoppedReason).toBe("max_queries");
    expect(result.riskSignals).toEqual([
      "CSC announced layoffs in the brand security unit in 2025.",
    ]);
  });

  it("stops before the cap once the job-focus page is found and the highlight topics were searched", async () => {
    const homepageOnly: RetrievedEvidenceBundle = {
      sources: [source({ url: HOME, title: "CSC Global" })],
      excerpts: [{ url: HOME, title: "CSC Global", text: "CSC corporate home." }],
    };
    const { result, calls } = await runProvider(homepageOnly, (call) => {
      if (call === 1) {
        return aiPayload({
          detail: POSTING,
          sources: [
            source({
              url: HOME,
              supports: ["companySummary", "jobFocus", "jobFocusDetail"],
            }),
          ],
        });
      }
      return aiPayload({
        detail:
          "The Domain and Brand Security business sells brand monitoring to enterprises.",
        sources: [
          source({
            url: BRAND,
            title: "Domain and Brand Security",
            supports: ["jobFocusDetail"],
          }),
        ],
        retrieved: [{ url: BRAND, title: "Domain and Brand Security" }],
      });
    });
    const searches = calls.filter((call) => call.webSearchEnabled);
    expect(searches).toHaveLength(1);
    expect(searches[0]?.messages?.some((message) => message.content.includes("leadership"))).toBe(
      true,
    );
    expect(result.stoppedReason).toBe("sufficient");
    expect(result.jobFocusDetail).toContain("brand monitoring");
  });

  it("fetches a homepage link for the job focus and sends that page to the model", async () => {
    const homepageHtml = `<a href="/solutions/domain-brand-security">Domain and Brand Security</a><p>CSC home</p>`;
    vi.stubGlobal("fetch", async () => {
      return new Response(
        `<html><head><title>Domain and Brand Security</title></head><body>CEO announced 2026 results. Public ownership. Competitors include MarkMonitor. The Domain and Brand Security business sells brand monitoring.</body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });
    const { calls } = await runProvider(
      {
        sources: [source({ url: HOME, title: "CSC Global" })],
        excerpts: [{ url: HOME, title: "CSC Global", text: "CSC corporate home." }],
        homepageHtml,
        homepageUrl: HOME,
      },
      (call) => {
        if (call === 1) {
          return aiPayload({
            detail: POSTING,
            sources: [
              source({
                url: HOME,
                supports: ["companySummary", "jobFocus", "jobFocusDetail"],
              }),
            ],
          });
        }
        return aiPayload({
          detail:
            "The Domain and Brand Security business sells brand monitoring to enterprises.",
          sources: [
            source({
              url: BRAND,
              title: "Domain and Brand Security",
              supports: ["companySummary", "jobFocusDetail"],
            }),
          ],
        });
      },
    );
    expect(calls.filter((call) => call.webSearchEnabled)).toHaveLength(0);
    expect(
      calls.some((call) =>
        call.messages?.some((message) => message.content.includes("domain-brand-security")),
      ),
    ).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase())(
  "research coverage fingerprint",
  { timeout: 60_000 },
  () => {
    const suffix = `cov-${Date.now().toString(36)}`;
    let organizationId = "";

    beforeAll(async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] COV ${suffix}`, slug: `cov-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `cov-${suffix}@example.test`,
          emailNormalized: `cov-${suffix}@example.test`,
          emailVerifiedAt: new Date(),
        },
      });
      await prisma.organizationMembership.create({
        data: { organizationId, userId: user.id, role: "OWNER" },
      });
      const product = await prisma.product.create({
        data: {
          organizationId,
          name: `Profile ${suffix}`,
          approvalStatus: "APPROVED",
        },
      });
      const company = await prisma.company.create({
        data: {
          organizationId,
          name: `CSC ${suffix}`,
          normalizedName: `csc-${suffix}`,
          website: `https://csc-${suffix}.example`,
          normalizedDomain: `csc-${suffix}.example`,
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: user.id,
          name: `CSC ${suffix}`,
          productId: product.id,
          companyResearchNotes: "Notes about domain security.",
        },
      });
      await prisma.jobRequirement.create({
        data: {
          organizationId,
          campaignId: campaign.id,
          companyId: company.id,
          rawText: "Senior Director of Sales for Domain and Brand Security.",
          title: "Senior Director of Sales",
          postingUrl: "https://www.cscglobal.com/careers/senior-director",
          companyName: `CSC ${suffix}`,
          suppliedEmployerWebsite: `https://csc-${suffix}.example`,
          employerDisposition: "IDENTIFIED",
          scorecardJson: { mission: null, outcomes: [], competencies: [] },
        },
      });
    });

    afterAll(async () => {
      setCompanyResearchProvider(null);
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("makes no paid call when the stored fingerprint matches", async () => {
      const company = await prisma.company.findFirstOrThrow({
        where: { organizationId, normalizedDomain: `csc-${suffix}.example` },
      });
      const campaign = await prisma.campaign.findFirstOrThrow({
        where: { organizationId, name: `CSC ${suffix}` },
      });
      process.env.RESEARCH_AI_PROVIDER = "openai-compatible";
      process.env.RESEARCH_AI_MODEL = "research-model";
      process.env.RESEARCH_AI_MODEL_URL = "https://research.example/v1/chat/completions";
      process.env.RESEARCH_AI_API_KEY = "research-key";
      const { researchCompany } = await import("@/lib/tenant/company-research-service");
      const paid = await import("@/lib/ai/paid-call-gate");
      const paidCall = vi.spyOn(paid, "runPaidStructuredCall");
      let calls = 0;
      setCompanyResearchProvider({
        async research() {
          calls += 1;
          return {
            companySummary: "CSC provides domain and brand security.",
            whatTheySell: "Domain and brand security",
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
            jobFocus: "Domain and Brand Security",
            jobFocusDetail: "The business sells brand monitoring.",
            confidence: "MEDIUM",
            sources: [
              source({
                url: `https://csc-${suffix}.example/solutions/domain-brand-security`,
                supports: ["companySummary", "jobFocusDetail"],
              }),
            ],
          };
        },
      });

      const first = await withTestTenant(organizationId, () =>
        researchCompany(company.id, {
          campaignId: campaign.id,
          anchorWebsite: `https://csc-${suffix}.example`,
          seekerSuppliedNotes: "Notes about domain security.",
        }),
      );
      expect(first.skipped, first.reason).toBe(false);
      expect(calls).toBe(1);

      paidCall.mockClear();
      const again = await withTestTenant(organizationId, () =>
        researchCompany(company.id, {
          campaignId: campaign.id,
          anchorWebsite: `https://csc-${suffix}.example`,
          seekerSuppliedNotes: "Notes about domain security.",
        }),
      );
      expect(again.skipped).toBe(true);
      expect(again.reason).toBe("unchanged");
      expect(calls).toBe(1);
      expect(paidCall).not.toHaveBeenCalled();
    });
  },
);
