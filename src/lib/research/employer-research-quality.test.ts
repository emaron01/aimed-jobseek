import { describe, expect, it } from "vitest";
import { parseResponsesPayload } from "@/lib/ai/providers/openai-responses";
import { fingerprintPaidCallInputs } from "@/lib/ai/paid-call-gate";
import { researchSourceDisplayTitle } from "@/lib/research/company-briefing";
import {
  applicationResearchFingerprint,
  companyResearchFingerprint,
} from "@/lib/research/company-research-paid-inputs";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/company-research";
import { buildCompanyResearchMessages } from "@/lib/research/prompt";
import {
  APPROVED_RESEARCH_NEWS_HOSTS,
  MAX_EMPLOYER_RESEARCH_SEARCHES,
  coverageSearchFocus,
  employerSearchBudget,
  missingHighlightTopics,
  type CoverageEvidenceInput,
} from "@/lib/research/source-policy";
import type { CompanyResearchAiResult } from "@/lib/research/assessment";
import type { ResearchSource } from "@/lib/research/types";
import { validateCompanyResearchResult } from "@/lib/research/validate";
import { DEFAULT_RESEARCH_POLICY_VALUES } from "@/lib/usage/defaults";

const APPROVED_INSTRUCTION =
  "You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Use the company's own website for what it does, who it serves, and how it describes working there. For funding, ownership, revenue, valuation, leadership changes, and news from the past 18 months, cite a reputable outside source when one is available: a major business publication, a newswire, or the company's press release. Do not cite a different organization with a similar name, a fundraiser, a student project, or a directory page about another company. State leadership as one timeline: name the current people the sources name, and include a leadership change only with the date the source gives. If a source names a change and gives no date, say the date is not in the sources. Do not write that there was no leadership change in the last 18 months when a cited source names a change with no date, or when sources name different people in the same role. Hiring and growth is the company's hiring and growth: expansion, a hiring freeze, layoffs, headcount trend, or other open roles. Do not restate this job's title, requirements, or qualifications. Cite every fact to a source. Leave a field empty when you find no evidence; never guess, and do not write that funding, ownership, or a leadership change was absent until you have checked those outside sources. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.";

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    sourceType: "NEWS",
    retrievedAt: "2026-10-06T00:00:00.000Z",
    supports: ["companySummary"],
    ...partial,
  };
}

function coverage(
  partial: Partial<CoverageEvidenceInput> & Pick<CoverageEvidenceInput, "sources">,
): CoverageEvidenceInput {
  return {
    anchorHost: "sift.com",
    companySummary: "Sift stops fraud.",
    whatTheySell: "Fraud prevention",
    jobFocus: null,
    jobFocusDetail: null,
    postingProvided: false,
    ...partial,
  };
}

describe("employer research quality", () => {
  it("uses the approved instruction, hiring schema line, and prompt version 10", () => {
    expect(RESEARCH_PROMPT_VERSION).toBe("10");
    expect(MAX_EMPLOYER_RESEARCH_SEARCHES).toBe(3);
    expect(employerSearchBudget(10)).toBe(3);
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toBe(APPROVED_INSTRUCTION);
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).not.toContain(
      "Prefer the company's own website and major business news",
    );
    const messages = buildCompanyResearchMessages({
      company: {
        organizationId: "org",
        companyId: "company",
        name: "Sift",
        website: "https://sift.com",
        normalizedDomain: "sift.com",
        industry: null,
        employeeCount: null,
        location: null,
      },
      evidence: { sources: [], excerpts: [] },
      webSearchEnabled: false,
    });
    expect(messages[0]?.content).toBe(APPROVED_INSTRUCTION);
    expect(messages[1]?.content).toContain(
      "string — company hiring and growth only, not this job posting",
    );
  });

  it("changes the application and company research fingerprints when the version is 10", () => {
    const application = {
      anchorHost: "sift.com",
      website: "https://sift.com",
      postingTitle: "Director",
      postingUrl: "https://sift.com/careers/director",
      postingText: "Director of Sales at Sift.",
      seekerSuppliedNotes: null,
    };
    const applicationAt10 = applicationResearchFingerprint(application);
    const applicationAt9 = fingerprintPaidCallInputs({
      promptVersion: "9",
      schemaName: "CompanyResearchAiResult",
      anchorHost: "sift.com",
      website: "https://sift.com",
      postingTitle: "Director",
      postingUrl: "https://sift.com/careers/director",
      postingText: "Director of Sales at Sift.",
      seekerSuppliedNotes: null,
    });
    const company = {
      name: "Sift",
      website: "https://sift.com",
      normalizedDomain: "sift.com",
      industry: null,
      employeeCount: null,
      location: null,
      seekerSuppliedNotes: null,
      depthPolicy: {
        maxSearchQueriesPerCompany:
          DEFAULT_RESEARCH_POLICY_VALUES.maxSearchQueriesPerCompany,
        maxSourcesPerCompany: DEFAULT_RESEARCH_POLICY_VALUES.maxSourcesPerCompany,
        researchFreshnessDays: DEFAULT_RESEARCH_POLICY_VALUES.researchFreshnessDays,
      },
      evidenceTargets: null,
    };
    const companyAt10 = companyResearchFingerprint(company);
    const companyAt9 = fingerprintPaidCallInputs({
      promptVersion: "9",
      schemaName: "CompanyResearchAiResult",
      name: "Sift",
      website: "https://sift.com",
      normalizedDomain: "sift.com",
      anchorHost: "sift.com",
      industry: null,
      employeeCount: null,
      location: null,
      seekerSuppliedNotes: null,
      depthPolicy: company.depthPolicy,
      evidenceTargets: null,
    });
    expect(applicationAt10).not.toBe(applicationAt9);
    expect(companyAt10).not.toBe(companyAt9);
    console.log(
      JSON.stringify({
        applicationResearchFingerprint: { v9: applicationAt9, v10: applicationAt10 },
        companyResearchFingerprint: { v9: companyAt9, v10: companyAt10 },
      }),
    );
  });

  it("keeps a news article that names the company and rejects lookalikes and job-focus-only pages", () => {
    expect(APPROVED_RESEARCH_NEWS_HOSTS).not.toContain("crunchbase.com");
    expect(APPROVED_RESEARCH_NEWS_HOSTS).not.toContain("pitchbook.com");
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://sift.com",
      companyDomain: "sift.com",
      companyName: "Sift",
      jobFocus: "digital fraud prevention",
      maxSources: 12,
      excerpts: [
        {
          url: "https://www.bizjournals.com/seattle/news/sift-office",
          title: "Local business",
          text: "Sift opened an office.",
        },
      ],
      sources: [
        source({
          url: "https://www.gofundme.com/acme",
          title: "Sift fundraiser",
          supports: ["companySummary"],
        }),
        source({
          url: "https://oneweekendai.com/northline",
          title: "Northline at One Weekend AI",
          supports: ["companySummary"],
        }),
        source({
          url: "https://thenorthlineinstitute.com/about",
          title: "The Northline Institute",
          sourceType: "COMPANY_WEBSITE",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.reuters.com/business/other",
          title: "Unrelated markets column",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.cnbc.com/2026/sift-funding",
          title: "Sift raises a growth round",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://www.cnbc.com/2026/sifting",
          title: "Sifting through fraud data",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.reuters.com/fraud-prevention",
          title: "Digital fraud prevention expands",
          supports: ["jobFocus"],
        }),
        source({
          url: "https://www.crunchbase.com/organization/sift",
          title: "Sift funding",
          sourceType: "DIRECTORY",
          supports: ["riskSignals"],
        }),
        source({
          url: "https://www.bizjournals.com/seattle/news/sift-office",
          title: "Local business",
          supports: ["companySummary"],
        }),
        source({
          url: "https://www.sift.com/about",
          title: "About Sift",
          sourceType: "COMPANY_WEBSITE",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized.map((row) => row.url).sort()).toEqual(
      [
        "https://www.bizjournals.com/seattle/news/sift-office",
        "https://www.cnbc.com/2026/sift-funding",
        "https://www.sift.com/about",
      ].sort(),
    );
  });

  it("leaves funding open on a silent company page and ignores a recent-news denial", () => {
    const silent = missingHighlightTopics(
      coverage({
        sources: [
          source({
            url: "https://sift.com/about",
            title: "About Sift",
            sourceType: "COMPANY_WEBSITE",
            supports: ["companySummary"],
          }),
        ],
        excerpts: [
          {
            url: "https://sift.com/about",
            title: "About Sift",
            text: "Sift stops online fraud for digital businesses. The CEO leads the company.",
          },
        ],
      }),
    );
    expect(silent).toContain("ownershipOrFinancialHealth");
    expect(silent).toContain("recentNews");
    expect(silent).not.toContain("leadership");

    const denial = missingHighlightTopics(
      coverage({
        sources: [
          source({
            url: "https://sift.com/news",
            title: "Sift news",
            sourceType: "COMPANY_WEBSITE",
            supports: ["companySummary"],
          }),
        ],
        excerpts: [
          {
            url: "https://sift.com/news",
            title: "Sift news",
            text: "No launches in the past 18 months. No leadership change in the last 18 months.",
          },
        ],
      }),
    );
    expect(denial).toContain("recentNews");

    const stated = missingHighlightTopics(
      coverage({
        sources: [
          source({
            url: "https://sift.com/about",
            title: "About Sift",
            sourceType: "COMPANY_WEBSITE",
            supports: ["companySummary"],
          }),
        ],
        excerpts: [
          {
            url: "https://sift.com/about",
            title: "About Sift",
            text: "Sift announced 2026 results after its latest funding round. Competitors include Forter.",
          },
        ],
      }),
    );
    expect(stated).not.toContain("ownershipOrFinancialHealth");
    expect(stated).not.toContain("recentNews");
  });

  it("asks outside sources for ownership and news, and still asks for a company page", () => {
    expect(
      coverageSearchFocus({
        missingTopics: ["ownershipOrFinancialHealth", "recentNews"],
        jobFocus: "fraud prevention",
        needJobFocusPage: true,
      }),
    ).toBe(
      "Find cited evidence for: ownership or financial health; news from the past 18 months. For ownership, financial health, funding, and news from the past 18 months, use a major business publication or newswire that names this company, not a different organization with a similar name. Find a page on the company website about fraud prevention.",
    );
  });

  it("fills an empty tool title from a later citation or the model, otherwise shows the hostname", () => {
    const parsed = parseResponsesPayload({
      output: [
        {
          type: "web_search_call",
          action: {
            sources: [{ url: "https://www.cnbc.com/2026/sift-funding" }],
          },
        },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Sift raised funding.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://www.cnbc.com/2026/sift-funding",
                  title: "Sift raises a growth round",
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed.retrievedSources[0]?.title).toBe("Sift raises a growth round");

    const page = "https://sift.com/leadership";
    const raw: CompanyResearchAiResult = {
      companySummary: "Sift",
      whatTheySell: null,
      customerTypes: [],
      primaryMarkets: [],
      businessModel: null,
      companySizeContext: null,
      relevantTechnologies: [],
      hiringSignals: [],
      riskSignals: [],
      jobFocus: null,
      jobFocusDetail: null,
      confidence: "MEDIUM",
      sources: [
        {
          url: page,
          title: "Leadership at Sift",
          publisher: null,
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: "2026-10-06T00:00:00.000Z",
          supports: ["companySummary"],
        },
        {
          url: "https://sift.com/careers",
          title: "https://sift.com/careers",
          publisher: null,
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: "2026-10-06T00:00:00.000Z",
          supports: ["companySummary"],
        },
      ],
    };
    const validated = validateCompanyResearchResult(raw, {
      sources: [
        source({
          url: page,
          title: null,
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
        source({
          url: "https://sift.com/careers",
          title: "   ",
          sourceType: "COMPANY_WEBSITE",
          supports: [],
        }),
      ],
      excerpts: [],
    });
    expect(validated.sources.find((row) => row.url === page)?.title).toBe(
      "Leadership at Sift",
    );
    expect(
      validated.sources.find((row) => row.url === "https://sift.com/careers")?.title,
    ).toBeNull();
    expect(
      researchSourceDisplayTitle({
        title: null,
        url: "https://www.sift.com/careers/open-roles",
      }),
    ).toBe("sift.com");
  });

  it("drops a hiring line that restates the posting and keeps a layoff, freeze, or headcount line", () => {
    const posting =
      "Senior Director of Sales responsible for enterprise accounts and a team of account executives. The company announced layoffs in the payments division.";
    const raw: CompanyResearchAiResult = {
      companySummary: "Sift",
      whatTheySell: null,
      customerTypes: [],
      primaryMarkets: [],
      businessModel: null,
      companySizeContext: null,
      relevantTechnologies: [],
      hiringSignals: [
        "Senior Director of Sales responsible for enterprise accounts and a team of account executives.",
        "The company announced layoffs in the payments division.",
        "Sift started a hiring freeze. Headcount stayed near 400.",
      ],
      riskSignals: [],
      jobFocus: null,
      jobFocusDetail: null,
      confidence: "MEDIUM",
      sources: [
        {
          url: "https://sift.com/about",
          title: "About Sift",
          publisher: null,
          sourceType: "COMPANY_WEBSITE",
          retrievedAt: "2026-10-06T00:00:00.000Z",
          supports: ["hiringSignals"],
        },
      ],
    };
    const validated = validateCompanyResearchResult(
      raw,
      {
        sources: [
          source({
            url: "https://sift.com/about",
            title: "About Sift",
            sourceType: "COMPANY_WEBSITE",
          }),
        ],
        excerpts: [],
      },
      { postingText: posting },
    );
    expect(validated.hiringSignals).toEqual([
      "The company announced layoffs in the payments division.",
      "Sift started a hiring freeze. Headcount stayed near 400.",
    ]);
  });
});
