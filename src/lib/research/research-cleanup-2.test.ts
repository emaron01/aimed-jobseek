import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyResearchProse } from "@/components/research-document";
import { describeCompanySourceLead } from "@/lib/research/company-briefing";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/company-research";
import {
  presentCompanyResearch,
  researchParagraphParts,
} from "@/lib/research/research-prose";
import {
  retrieveWebsiteEvidence,
  selectCompanyKeyPageUrl,
  WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP,
  WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
} from "@/lib/research/sources";
import type { ResearchSource } from "@/lib/research/types";
import { employerRisksForJobSeeker } from "@/lib/research/validate";

const APPROVED_BRIEF = `You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Use the company's own website for what it does, who it serves, and how it describes working there. For funding, ownership, revenue, valuation, leadership changes, and news from the past 18 months, cite a reputable outside source when one is available: a major business publication, a newswire, or the company's press release. Do not cite a different organization with a similar name, a fundraiser, a student project, or a directory page about another company. State leadership as one timeline: name the current people the sources name, and include a leadership change only with the date the source gives. If a source names a change and gives no date, say the date is not in the sources. Do not write that there was no leadership change in the last 18 months when a cited source names a change with no date, or when sources name different people in the same role. Hiring and growth is the company's hiring and growth: expansion, a hiring freeze, layoffs, headcount trend, or other open roles. Do not restate this job's title, requirements, or qualifications. Cite every fact to a source. Leave a field empty when you find no evidence; never guess, and do not write that funding, ownership, or a leadership change was absent until you have checked those outside sources. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.`;

const JOB_DEMAND =
  "The job's emphasis on predictable revenue, forecast discipline, pipeline coverage, expansion penetration, and new-logo acquisition suggests a demanding scaling and sales-execution mandate";
const COMPETITORS =
  "market sources identify MarkMonitor, OpSec Security, and Corsearch as leading brand-protection-tool vendors";
const SUMMARY =
  "The available evidence indicates an enterprise B2B model combining recurring technology-enabled services with expert monitoring, advisory, and enforcement work.";
const POSTING_SENTENCE =
  "The job posting says the role owns forecast discipline for the brand unit.";

function source(partial: Partial<ResearchSource> & Pick<ResearchSource, "url">): ResearchSource {
  return {
    title: partial.title ?? null,
    publisher: null,
    sourceType: partial.sourceType ?? "OTHER",
    retrievedAt: "2026-10-04T00:00:00.000Z",
    supports: partial.supports ?? ["companySummary"],
    ...partial,
  };
}

function renderedMarkers(text: string, sources: ResearchSource[]): string {
  return renderToStaticMarkup(
    createElement(CompanyResearchProse, { text, sources }),
  );
}

describe("research cleanup 2", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders citation markers with no stray parentheses or link syntax", () => {
    const sources = [
      source({
        url: "https://www.cscglobal.com/a",
        title: "CSC Global about",
        sourceType: "COMPANY_WEBSITE",
      }),
      source({
        url: "https://www.example.com/news",
        title: "Business news",
        sourceType: "NEWS",
      }),
      source({
        url: "https://www.cscdbs.com/b",
        title: "CSC DBS services",
        sourceType: "COMPANY_WEBSITE",
      }),
    ];
    const paired = renderedMarkers(
      "CSC cites both sites (https://www.cscglobal.com/a)(https://www.cscdbs.com/b)).",
      sources,
    );
    const reversedSources = [
      source({
        url: "https://www.cscglobal.com/a",
        title: "CSC Global about",
        sourceType: "COMPANY_WEBSITE",
      }),
      source({
        url: "https://www.cscdbs.com/b",
        title: "CSC DBS services",
        sourceType: "COMPANY_WEBSITE",
      }),
    ];
    const reversed = renderedMarkers(
      "CSC cites both sites (https://www.cscdbs.com/b))(https://www.cscglobal.com/a).",
      reversedSources,
    );
    const markdown = renderedMarkers(
      "CSC cites ([CSC Global](https://www.cscglobal.com/a)).",
      sources,
    );
    for (const html of [paired, reversed, markdown]) {
      expect(html).toContain("[1]");
      expect(html).not.toMatch(/\[\d+\]\)/);
      expect(html).not.toMatch(/\)\[\d+\]/);
      expect(html).not.toContain("[CSC");
    }
    expect(paired).toContain("[3]");
    expect(paired).not.toContain("[1][3])");
    expect(reversed).toContain("[2]");
    expect(reversed).toContain("[1]");
    expect(reversed).not.toContain("[2])[1]");
    expect(reversed).not.toMatch(/\)/);
    const parts = researchParagraphParts(
      "CSC cites both sites (https://www.cscglobal.com/a)(https://www.cscdbs.com/b)).",
      sources,
    ).flat();
    expect(parts.filter((part) => part.type === "text").some((part) => part.type === "text" && part.value.includes(")"))).toBe(false);
  });

  it("labels anchor-host and sister-site pages as company website pages", () => {
    const presented = presentCompanyResearch(
      {
        companySummary: "CSC provides domain security.",
        sources: [
          source({ url: "https://www.cscglobal.com/service/about/", title: "About CSC" }),
          source({ url: "https://www.cscdbs.com/en/", title: "CSC DBS" }),
          source({
            url: "https://www.reuters.com/csc",
            title: "Reuters report on CSC",
            sourceType: "NEWS",
          }),
        ],
      },
      { companyName: "CSC", anchorHost: "cscglobal.com", sisterHosts: ["cscdbs.com"] },
    );
    expect(presented.sources.map((row) => row.sourceType)).toEqual([
      "COMPANY_WEBSITE",
      "COMPANY_WEBSITE",
      "NEWS",
    ]);
    expect(
      describeCompanySourceLead({
        sources: presented.sources,
        researchMethod: "AUTOMATED",
      }).sentence,
    ).toBe("We read 3 sources — 2 company website pages and 1 other source.");
  });

  it("fetches the homepage and the about page's leadership and careers links within the limits", async () => {
    const home = "https://www.cscglobal.com/";
    const about = "https://www.cscglobal.com/service/about/";
    const offices = "https://www.cscglobal.com/service/about/csc-office-locations/";
    const leadership = "https://www.cscglobal.com/service/about/leadership-team/";
    const careers = "https://www.cscglobal.com/service/careers/";
    const homeHtml = `
      <a href="${offices}">Office locations</a>
      <a href="${about}">About CSC</a>
      <a href="${careers}">Careers</a>
    `;
    const aboutHtml = `<a href="${leadership}">Leadership team</a><p>${"About CSC. ".repeat(30)}</p>`;
    expect(
      selectCompanyKeyPageUrl({
        html: homeHtml,
        pageUrl: home,
        anchorHost: "cscglobal.com",
        kind: "about",
      }),
    ).toBe(about);

    vi.stubGlobal("fetch", async (url: string | URL) => {
      const href = String(url);
      const body =
        href === home
          ? `<html><head><title>CSC</title></head><body>${homeHtml}<p>${"Home. ".repeat(40)}</p></body></html>`
          : href === about
            ? `<html><head><title>About</title></head><body>${aboutHtml}</body></html>`
            : href === leadership
              ? `<html><head><title>Leadership</title></head><body>${"Leaders. ".repeat(20)}</body></html>`
              : href === careers
                ? `<html><head><title>Careers</title></head><body>${"Culture. ".repeat(20)}</body></html>`
                : href === offices
                  ? `<html><head><title>Offices</title></head><body>${"Offices. ".repeat(20)}</body></html>`
                  : "";
      if (!body) {
        return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
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
    expect(urls).toContain(home);
    expect(urls).toContain(about);
    expect(urls).toContain(leadership);
    expect(urls).toContain(careers);
    expect(urls).not.toContain(offices);
    expect(bundle.excerpts.every((excerpt) => excerpt.text.length <= WEBSITE_EVIDENCE_PER_PAGE_CHAR_CAP)).toBe(true);
    expect(bundle.excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0)).toBeLessThanOrEqual(
      WEBSITE_EVIDENCE_TOTAL_CHAR_BUDGET,
    );
    const joined = bundle.excerpts.map((excerpt) => excerpt.text).join("\n");
    expect(joined).toContain("Home.");
    expect(joined).toContain("Leaders.");
    expect(joined).toContain("About CSC.");
    expect(joined).toContain("Culture.");
  });

  it("skips an unreachable key page and still sends the pages that loaded", async () => {
    const home = "https://www.cscglobal.com/";
    const about = "https://www.cscglobal.com/service/about/";
    const leadership = "https://www.cscglobal.com/service/about/leadership-team/";
    const careers = "https://www.cscglobal.com/service/careers/";
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const href = String(url);
      if (href === leadership) {
        return new Response("blocked", { status: 403, headers: { "content-type": "text/html" } });
      }
      const body =
        href === home
          ? `<html><body><a href="${about}">About</a><a href="${leadership}">Leadership</a><a href="${careers}">Careers</a><p>${"Home. ".repeat(20)}</p></body></html>`
          : href === about
            ? `<html><body>${"About CSC. ".repeat(20)}</body></html>`
            : href === careers
              ? `<html><body>${"Culture. ".repeat(20)}</body></html>`
              : "";
      if (!body) {
        return new Response("missing", { status: 404, headers: { "content-type": "text/html" } });
      }
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
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
    expect(urls).toContain(about);
    expect(urls).toContain(careers);
    expect(urls).not.toContain(leadership);
    expect(bundle.excerpts.map((excerpt) => excerpt.text).join(" ")).toContain("Home.");
  });

  it("removes a job-demand employer risk and keeps a real employer risk", () => {
    const risks = employerRisksForJobSeeker(
      [
        JOB_DEMAND,
        "CSC announced layoffs in the sales organization.",
        "A securities lawsuit was filed against CSC.",
      ],
      "Senior Director of Sales. Predictable revenue and forecast discipline.",
    );
    expect(risks).toEqual([
      "CSC announced layoffs in the sales organization.",
      "A securities lawsuit was filed against CSC.",
    ]);
    const presented = presentCompanyResearch(
      {
        companySummary: "CSC provides domain security.",
        riskSignals: [JOB_DEMAND, "CSC announced layoffs in the sales organization."],
        sources: [source({ url: "https://www.cscglobal.com/news", title: "CSC news" })],
      },
      { companyName: "CSC", anchorHost: "cscglobal.com" },
    );
    expect(presented.riskSignals).toEqual([
      "CSC announced layoffs in the sales organization.",
    ]);
  });

  it("keeps an uncited sentence that names a company, a number, or a date", () => {
    const numberSentence = "The unit grew revenue by 18% last cycle.";
    const dateSentence = "The partnership was announced on June 4, 2026.";
    const presented = presentCompanyResearch(
      {
        companySummary: `${COMPETITORS}. ${numberSentence} ${dateSentence} ${SUMMARY} ${POSTING_SENTENCE}`,
        sources: [source({ url: "https://www.cscglobal.com/about", title: "About CSC" })],
      },
      { companyName: "CSC", anchorHost: "cscglobal.com" },
    );
    expect(presented.companySummary).toContain("MarkMonitor");
    expect(presented.companySummary).toContain("OpSec");
    expect(presented.companySummary).toContain("Corsearch");
    expect(presented.companySummary).toContain("18%");
    expect(presented.companySummary).toContain("June 4, 2026");
    expect(presented.companySummary).toContain(SUMMARY);
    expect(presented.companySummary).toContain(POSTING_SENTENCE);
  });

  it("keeps the approved brief, version 9, and does not research from a page view", () => {
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toBe(APPROVED_BRIEF);
    expect(RESEARCH_PROMPT_VERSION).toBe("10");
    const service = readFileSync("src/lib/tenant/company-research-service.ts", "utf8");
    const skip = service.indexOf("if (applicationResearchIsReusable(stored, fingerprint))");
    const providerCall = service.indexOf("provider.research(");
    expect(skip).toBeGreaterThan(-1);
    expect(providerCall).toBeGreaterThan(skip);
    for (const file of [
      "src/components/ApplicationWorkspace.tsx",
      "src/components/ApplicationCompanyBody.tsx",
      "src/components/ApplicationJobBody.tsx",
      "src/components/application-workspace-model.ts",
      "src/components/ApplicationCompanyBriefing.tsx",
      "src/app/(app)/campaigns/[id]/summary/page.tsx",
    ]) {
      const page = readFileSync(file, "utf8");
      expect(page).not.toContain("researchCompany(");
      expect(page).not.toContain("runPaidStructuredCall");
      expect(page).not.toContain("enqueueApplicationResearch");
    }
  });
});
