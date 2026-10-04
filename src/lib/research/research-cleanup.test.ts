import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationCompanyBriefing,
  CheatSheetCompanyResearch,
} from "@/components/ApplicationCompanyBriefing";
import { sisterHostsFromResearchTimings } from "@/lib/application/company-website";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/company-research";
import { prisma } from "@/lib/prisma-client";
import {
  applicationResearchFingerprint,
} from "@/lib/research/company-research-paid-inputs";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { finalizeResearchSources } from "@/lib/research/finalize-sources";
import {
  cleanResearchForSave,
  presentCompanyResearch,
  sentenceCitesOnlyDroppedSources,
} from "@/lib/research/research-prose";
import {
  getCompanySourceRetriever,
  retrieveWebsiteEvidence,
  selectCompanyKeyPageUrl,
  sisterHostsFromPageHtml,
  setCompanySourceRetriever,
  WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP,
  WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
} from "@/lib/research/sources";
import type { ResearchSource } from "@/lib/research/types";
import { saveApplicationEmployerResearch } from "@/lib/tenant/company-research-service";
import { hasTestDatabase } from "@/test/database";
import { withTestTenant } from "@/test/with-test-tenant";

const APPROVED_BRIEF =
  "You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Prefer the company's own website and major business news. Cite every fact to a source. Leave a field empty when you find no evidence; never guess. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.";

const previousRetriever = getCompanySourceRetriever();

afterEach(() => {
  setCompanySourceRetriever(previousRetriever);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function source(
  partial: Partial<ResearchSource> & Pick<ResearchSource, "url">,
): ResearchSource {
  return {
    title: null,
    publisher: null,
    sourceType: "COMPANY_WEBSITE",
    retrievedAt: "2026-10-04T00:00:00.000Z",
    supports: [],
    ...partial,
  };
}

const KEPT = source({
  url: "https://www.cscglobal.com/service/about/leadership-team/?utm_source=openai",
  title: "Leadership Team | CSC Global",
  supports: ["companySummary", "jobFocusDetail"],
});

const UNCITED = source({
  url: "https://www.cscglobal.com/service/entity-management/",
  title: "Entity Management",
  supports: [],
});

const DETAIL = [
  "The brand unit sells monitoring to global companies.",
  "(Leadership Team | CSC Global)",
  "Competitors include Markmonitor according to cbinsights.com.",
  "The company was founded long before this posting.",
  "Recent news is on https://www.cscglobal.com/news?utm_source=openai&id=1.",
].join(" ");

const STORED_DETAIL = `The brand unit sells monitoring.\\n\\nIt serves global companies. (Leadership Team | CSC Global)`;

function renderBoth(detail: string, sources: ResearchSource[]) {
  const shared = {
    companySummary: "CSC provides corporate services. (Leadership Team | CSC Global)",
    whatTheySell: "Domain and brand services.",
    jobFocus: "Domain and brand security",
    jobFocusDetail: detail,
    sources,
  };
  const cheat = renderToStaticMarkup(createElement(CheatSheetCompanyResearch, shared));
  const application = renderToStaticMarkup(
    createElement(ApplicationCompanyBriefing, {
      campaignId: "campaign-cleanup",
      canEdit: false,
      companyName: "CSC",
      meta: {
        domain: "cscglobal.com",
        industry: null,
        location: null,
        employeeCount: null,
        revenue: null,
        lastResearched: null,
      },
      defaults: {
        ...shared,
        customerTypes: [],
        primaryMarkets: [],
        businessModel: null,
        companySizeContext: null,
        relevantTechnologies: [],
        hiringSignals: [],
        riskSignals: [],
      },
      sources,
      researchMethod: "AUTOMATED",
      researchStatus: "Researched",
      notes: "",
      researchLive: false,
    }),
  );
  return { cheat, application };
}

describe("research cleanup", () => {
  it("keeps the approved research brief and a matching fingerprint", () => {
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toBe(APPROVED_BRIEF);
    expect(RESEARCH_PROMPT_VERSION).toBe("9");
    const input = {
      anchorHost: "cscglobal.com",
      website: "https://cscglobal.com",
      postingTitle: "Senior Director",
      postingUrl: "https://cscglobal.com/jobs/1",
      postingText: "Domain and brand security.",
      seekerSuppliedNotes: "About page notes",
    };
    expect(applicationResearchFingerprint(input)).toBe(
      applicationResearchFingerprint(input),
    );
    const service = readFileSync("src/lib/tenant/company-research-service.ts", "utf8");
    const skip = service.indexOf("if (applicationResearchIsReusable(stored, fingerprint))");
    const providerCall = service.indexOf("provider.research(");
    expect(skip).toBeGreaterThan(-1);
    expect(providerCall).toBeGreaterThan(skip);
    for (const file of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationCompanyBriefing.tsx",
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
    ]) {
      const page = readFileSync(file, "utf8");
      expect(page).not.toContain("researchCompany(");
      expect(page).not.toContain("runPaidStructuredCall");
      expect(page).not.toContain("enqueueApplicationResearch");
      expect(page).not.toContain("web_search");
    }
    expect(readFileSync("src/lib/research/sources.ts", "utf8")).not.toContain("web_search");
  });

  it("counts a linked domain as a sister site only when it shares the company name", () => {
    const linked = (hrefs: string[]) =>
      hrefs.map((href) => `<a href="${href}">link</a>`).join("");
    const sisters = sisterHostsFromPageHtml({
      html: linked([
        "https://www.cscdbs.com/",
        "https://www.crowdstrike.com/",
        "https://www.globalpartners.com/",
        "https://www.linkedin.com/company/csc",
        "https://www.reuters.com/world/csc",
        "https://www.indeed.com/cmp/csc",
      ]),
      pageUrl: "https://www.cscglobal.com/",
      anchorHost: "cscglobal.com",
      companyName: "CSC",
    });
    expect(sisters).toEqual(["cscdbs.com"]);

    expect(
      sisterHostsFromPageHtml({
        html: linked(["https://www.linkedin.com/company/linkedin"]),
        pageUrl: "https://www.linkedincorp.com/",
        anchorHost: "linkedincorp.com",
        companyName: "LinkedIn",
      }),
    ).toEqual([]);
    expect(
      sisterHostsFromPageHtml({
        html: linked(["https://www.reuters.com/"]),
        pageUrl: "https://www.reutersmedia.com/",
        anchorHost: "reutersmedia.com",
        companyName: "Reuters",
      }),
    ).toEqual([]);
    expect(
      sisterHostsFromPageHtml({
        html: linked(["https://www.indeed.com/"]),
        pageUrl: "https://www.indeedglobal.com/",
        anchorHost: "indeedglobal.com",
        companyName: "Indeed",
      }),
    ).toEqual([]);
  });

  it("renders stored newline escapes as paragraphs on both company sections", () => {
    const { cheat, application } = renderBoth(STORED_DETAIL, [KEPT, UNCITED]);
    for (const html of [cheat, application]) {
      expect(html).not.toContain("\\n");
      expect(html).toContain("The brand unit sells monitoring.");
      expect(html).toContain("It serves global companies.");
      expect(html).toContain('data-testid="research-paragraph"');
    }
    const presented = presentCompanyResearch(
      {
        jobFocusDetail: STORED_DETAIL,
        sources: [KEPT],
      },
      { anchorHost: "cscglobal.com" },
    );
    expect(presented.jobFocusDetail.split("\n\n")).toHaveLength(2);
  });

  it("shows only cited sources in the list and the count", () => {
    const { cheat, application } = renderBoth(DETAIL, [KEPT, UNCITED]);
    for (const html of [cheat, application]) {
      expect(html).toContain("Leadership Team | CSC Global");
      expect(html).not.toContain("Entity Management");
      expect(html).not.toContain("entity-management");
    }
    expect(application).toContain("We read 1 source");
    expect(application).not.toContain("We read 2 sources");
  });

  it("keeps a sister site linked from the anchor and drops a sentence that cites only a dropped host", () => {
    const sister = source({
      url: "https://www.cscdbs.com/about",
      title: "CSC DBS",
      supports: ["companySummary"],
    });
    const finalized = finalizeResearchSources({
      companyWebsiteUrl: "https://www.cscglobal.com",
      companyDomain: "cscglobal.com",
      companyName: "CSC",
      sisterHosts: ["cscdbs.com"],
      maxSources: 8,
      sources: [
        sister,
        source({
          url: "https://www.cbinsights.com/company/csc",
          title: "CSC competitors",
          sourceType: "OTHER",
          supports: ["companySummary"],
        }),
      ],
    });
    expect(finalized.map((row) => row.url)).toEqual(["https://www.cscdbs.com/about"]);

    const cleaned = cleanResearchForSave(
      {
        companySummary:
          "CSC employs specialists. Leaders include Ann (cbinsights.com). The sister site describes the business (cscdbs.com).",
        whatTheySell: null,
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
        jobFocus: null,
        jobFocusDetail: "Uncited history stays in the text.",
        confidence: "MEDIUM",
        sources: finalized,
      },
      { anchorHost: "cscglobal.com", sisterHosts: ["cscdbs.com"] },
    );
    expect(cleaned.companySummary).not.toContain("cbinsights.com");
    expect(cleaned.companySummary).toContain("cscdbs.com");
    expect(cleaned.companySummary).toContain("CSC employs specialists.");
    expect(cleaned.jobFocusDetail).toBe("Uncited history stays in the text.");
    expect(
      sentenceCitesOnlyDroppedSources(
        "Uncited history stays in the text.",
        finalized,
        { anchorHost: "cscglobal.com" },
      ),
    ).toBe(false);
    expect(cleaned.sources.map((row) => row.url)).toEqual([
      "https://www.cscdbs.com/about",
    ]);
  });

  it("strips tracking parameters and renders numbered citations that match the source list", () => {
    const cleaned = cleanResearchForSave(
      {
        companySummary: "CSC provides corporate services.",
        whatTheySell: null,
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
        jobFocus: null,
        jobFocusDetail: DETAIL,
        confidence: "MEDIUM",
        sources: [KEPT, UNCITED],
      },
      { anchorHost: "cscglobal.com" },
    );
    expect(cleaned.sources).toHaveLength(1);
    expect(cleaned.sources[0]?.url).toBe(
      "https://www.cscglobal.com/service/about/leadership-team/",
    );
    expect(cleaned.jobFocusDetail).toContain("https://www.cscglobal.com/news?id=1");
    expect(cleaned.jobFocusDetail).not.toContain("utm_source");
    expect(cleaned.jobFocusDetail).not.toContain("cbinsights.com");
    expect(cleaned.jobFocusDetail).toContain(
      "The company was founded long before this posting.",
    );

    const { cheat, application } = renderBoth(DETAIL, [KEPT, UNCITED]);
    expect(cheat.split("Leadership Team | CSC Global")).toHaveLength(2);
    expect(application.split("Leadership Team | CSC Global")).toHaveLength(3);
    for (const html of [cheat, application]) {
      expect(html).toContain('data-citation="1"');
      expect(html).toContain("[1]");
      expect(html).not.toContain("utm_source");
      expect(html).not.toContain("cbinsights.com");
    }
  });

  it("fetches leadership, about, and careers links from the homepage within the existing limits", async () => {
    const home = "https://www.cscglobal.com/";
    const leadership = "https://www.cscglobal.com/service/about/leadership-team/";
    const about = "https://www.cscglobal.com/service/about/";
    const careers = "https://www.cscglobal.com/service/careers/our-mission/";
    const html = `
      <a href="${leadership}">Leadership team</a>
      <a href="${about}">About CSC</a>
      <a href="${careers}">Our mission</a>
      <a href="https://www.cscdbs.com/">CSC DBS</a>
      <a href="https://www.linkedin.com/company/csc">LinkedIn</a>
    `;
    expect(
      selectCompanyKeyPageUrl({
        html,
        pageUrl: home,
        anchorHost: "cscglobal.com",
        kind: "leadership",
      }),
    ).toBe(leadership);
    expect(
      selectCompanyKeyPageUrl({
        html,
        pageUrl: home,
        anchorHost: "cscglobal.com",
        kind: "about",
      }),
    ).toBe(about);
    expect(
      selectCompanyKeyPageUrl({
        html,
        pageUrl: home,
        anchorHost: "cscglobal.com",
        kind: "careers",
      }),
    ).toBe(careers);

    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const href = String(url);
      fetched.push(href);
      const page = href.startsWith(home.replace(/\/$/, "")) && href.length < home.length + 2
        ? html
        : href.startsWith(leadership)
          ? `<html><head><title>Leadership</title></head><body>${"Leaders. ".repeat(20)}</body></html>`
          : href.startsWith(about)
            ? `<html><head><title>About</title></head><body>${"About CSC. ".repeat(20)}</body></html>`
            : href.startsWith(careers)
              ? `<html><head><title>Mission</title></head><body>${"Our mission. ".repeat(20)}</body></html>`
              : "";
      if (!page) {
        return new Response("missing", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(
        href === home || href === `${home.replace(/\/$/, "")}/`
          ? `<html><head><title>CSC</title></head><body>${html}<p>${"Home. ".repeat(30)}</p></body></html>`
          : page,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    });

    const bundle = await retrieveWebsiteEvidence({
      organizationId: "org",
      companyId: "co",
      name: "CSC",
      website: home,
      normalizedDomain: "cscglobal.com",
      industry: null,
      employeeCount: null,
      location: null,
    });
    const urls = bundle.excerpts.map((excerpt) => excerpt.url);
    expect(urls.some((url) => url.includes("/leadership-team"))).toBe(true);
    expect(urls.some((url) => url.includes("/service/about/"))).toBe(true);
    expect(urls.some((url) => url.includes("/our-mission"))).toBe(true);
    expect(bundle.sisterHosts).toContain("cscdbs.com");
    expect(bundle.sisterHosts).not.toContain("linkedin.com");
    expect(bundle.excerpts.every((excerpt) => excerpt.text.length <= WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP)).toBe(true);
    expect(bundle.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBeLessThanOrEqual(
      WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
    );
    expect(fetched.every((url) => url.includes("cscglobal.com"))).toBe(true);
    expect(WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP).toBe(4_000);
    expect(WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET).toBe(16_000);
  });
});

describe.skipIf(!hasTestDatabase())(
  "research cleanup against postgres",
  { timeout: 60_000 },
  () => {
    const suffix = `cleanup-${Date.now().toString(36)}`;
    let organizationId = "";

    afterAll(async () => {
      if (organizationId) {
        await prisma.organization
          .delete({ where: { id: organizationId } })
          .catch(() => undefined);
      }
    });

    it("saves cleaned research and does not rewrite the row when the page is rendered", async () => {
      const org = await prisma.organization.create({
        data: { name: `[TEST] Cleanup ${suffix}`, slug: `cleanup-${suffix}` },
      });
      organizationId = org.id;
      const user = await prisma.user.create({
        data: {
          email: `cleanup-${suffix}@example.test`,
          emailNormalized: `cleanup-${suffix}@example.test`,
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
          website: "https://cscglobal.com",
          normalizedDomain: "cscglobal.com",
        },
      });
      const campaign = await prisma.campaign.create({
        data: {
          organizationId,
          ownerUserId: user.id,
          name: `CSC ${suffix}`,
          productId: product.id,
        },
      });
      const cleaned = cleanResearchForSave(
        {
          companySummary: "CSC provides corporate services.",
          whatTheySell: "Domain services.",
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
          jobFocus: "Domain and brand security",
          jobFocusDetail: STORED_DETAIL,
          confidence: "MEDIUM",
          sources: [KEPT, UNCITED],
        },
        { anchorHost: "cscglobal.com", sisterHosts: ["cscdbs.com"] },
      );
      const saved = await withTestTenant(organizationId, () =>
        saveApplicationEmployerResearch({
          campaignId: campaign.id,
          companyId: company.id,
          result: cleaned,
          anchorHost: "cscglobal.com",
          sisterHosts: ["cscdbs.com"],
          inputFingerprint: applicationResearchFingerprint({
            anchorHost: "cscglobal.com",
            website: "https://cscglobal.com",
            postingTitle: null,
            postingUrl: null,
            postingText: null,
          }),
          provenance: {
            aiProvider: "openai-responses",
            aiModel: "gpt-5.6-luna",
            aiModelUrlIdentifier: "openai-responses",
            promptVersion: RESEARCH_PROMPT_VERSION,
          },
        }),
      );
      expect(saved.jobFocusDetail).not.toContain("\\n");
      expect(saved.jobFocusDetail).toContain("The brand unit sells monitoring.");
      expect(saved.jobFocusDetail).toContain("It serves global companies.");
      const sources = saved.researchSources as ResearchSource[];
      expect(sources).toHaveLength(1);
      expect(sources[0]?.url).not.toContain("utm_");
      expect(sisterHostsFromResearchTimings(saved.researchStageTimings)).toEqual([
        "cscdbs.com",
      ]);

      const before = await prisma.applicationEmployerResearch.count({
        where: { campaignId: campaign.id },
      });
      renderBoth(String(saved.jobFocusDetail), sources);
      const after = await prisma.applicationEmployerResearch.findMany({
        where: { campaignId: campaign.id },
      });
      expect(after).toHaveLength(before);
      expect(after[0]?.updatedAt.toISOString()).toBe(saved.updatedAt.toISOString());
      expect(after[0]?.jobFocusDetail).toBe(saved.jobFocusDetail);
    });
  },
);
