import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheatSheetSectionKind } from "@/lib/application-summary/people";
import { APPLICATION_SUMMARY_PROMPT_VERSION } from "@/lib/application-summary/contract";
import { CONSULTATION_PROMPT_VERSION } from "@/lib/consultation/contract";
import { CONTACT_PROFILE_PROMPT_VERSION } from "@/lib/contact-profile/contract";
import {
  APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS,
  COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
  CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
  CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS,
  INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS,
} from "@/lib/prompt-content";
import { RESEARCH_PROMPT_VERSION } from "@/lib/research/config";
import { INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION } from "@/lib/interview/contract";

function src(path: string): string {
  return readFileSync(path, "utf8");
}

const SALES_ONLY_TERMS = [
  "MEDDIC",
  "MEDDPICC",
  "quota",
  "pipeline review",
  "deal review",
] as const;

describe("Harper Batch D1 — role-agnostic prompts", () => {
  it("coach prompt has approved scope and Jordan example; no sales examples", () => {
    expect(CONSULTATION_PROMPT_VERSION).toBe("39");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      "Scope: you coach for any role, in any industry, at any career stage. Never introduce methods, tools, frameworks, or metrics from any profession unless they appear in the supplied Personal Profile or job sources.",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).toContain(
      'for example "when you talk with Jordan about how you trained new team members, lead with the onboarding checklist you built, because that is how they have built their teams"',
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).not.toContain("MEDDIC");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).not.toContain("MEDDPICC");
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).not.toContain(
      "forecast process",
    );
    expect(CONSULTATION_COACH_SYSTEM_INSTRUCTIONS).not.toContain("Erik");
  });

  it("extract prompt uses neutral incomplete and meta examples", () => {
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).toContain(
      "which steps did I take",
    );
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).toContain(
      'A one-line claim such as "I have done that work" is incomplete',
    );
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).not.toContain("MEDDIC");
    expect(CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS).not.toContain(
      "used forecasting",
    );
  });

  it("contact, company research, cheat sheet, and thank-you clarify use approved text", () => {
    expect(CONTACT_PROFILE_PROMPT_VERSION).toBe("4");
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).toContain(
      '"Jordan is big on hands-on training: they built the onboarding program at two employers and coached every new lead through it."',
    );
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).not.toContain("Erik");
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).not.toContain("MEDDPICC");

    expect(RESEARCH_PROMPT_VERSION).toBe("10");
    expect(COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS).toBe(
      "You are researching an employer for a job seeker preparing to apply and interview for the job in the posting provided. Research only the company identified by the website provided; ignore organizations with similar names. Start with company highlights: what the company does and for whom (products, services, customers, and markets); its size, stage, ownership, and financial health or funding; its leadership team and any recent leadership changes; its strategy, priorities, and news from the past 18 months (launches, acquisitions, partnerships, layoffs, restructuring); its culture, values, and how it describes working there; and its main competitors and market position. Then align with the job: identify the part of the company this job serves (a business unit, product line, service, segment, or market) and research it in depth, including its products and services, customers, competitors, leaders, priorities, recent news, how it fits the wider company, and anything that relates to the job's requirements. Use the company's own website for what it does, who it serves, and how it describes working there. For funding, ownership, revenue, valuation, leadership changes, and news from the past 18 months, cite a reputable outside source when one is available: a major business publication, a newswire, or the company's press release. Do not cite a different organization with a similar name, a fundraiser, a student project, or a directory page about another company. State leadership as one timeline: name the current people the sources name, and include a leadership change only with the date the source gives. If a source names a change and gives no date, say the date is not in the sources. Do not write that there was no leadership change in the last 18 months when a cited source names a change with no date, or when sources name different people in the same role. Hiring and growth is the company's hiring and growth: expansion, a hiring freeze, layoffs, headcount trend, or other open roles. Do not restate this job's title, requirements, or qualifications. Cite every fact to a source. Leave a field empty when you find no evidence; never guess, and do not write that funding, ownership, or a leadership change was absent until you have checked those outside sources. Do not look for sales-prospecting information such as deal sizes, buyer segments, churn risk, or fit scores.",
    );

    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("20");
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain(
      "Role scope: write for this job's actual role and industry. Never introduce methods, tools, frameworks, or metrics that are not in the supplied sources.",
    );

    expect(INTERVIEW_THANK_YOU_CLARIFY_PROMPT_VERSION).toBe("1");
    expect(INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS).toContain(
      "thank-you message",
    );
  });

  it("Harper-related prompts contain no sales-only instruction or example terms", () => {
    const prompts = [
      CONSULTATION_COACH_SYSTEM_INSTRUCTIONS,
      CONSULTATION_EXTRACT_SYSTEM_INSTRUCTIONS,
      CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS,
      COMPANY_RESEARCH_SYSTEM_INSTRUCTIONS,
      APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS,
      INTERVIEW_THANK_YOU_CLARIFY_SYSTEM_INSTRUCTIONS,
    ];
    for (const prompt of prompts) {
      const lower = prompt.toLowerCase();
      for (const term of SALES_ONLY_TERMS) {
        expect(lower).not.toContain(term.toLowerCase());
      }
    }
  });

  it("executive classifier matches Executive Sponsor without sales", () => {
    expect(
      cheatSheetSectionKind({
        roleName: "Executive Sponsor",
        titles: [],
        involvement: "DIRECT",
        suggestionKey: null,
      }),
    ).toBe("EXECUTIVE");
    expect(src("src/lib/application-summary/people.ts")).not.toContain(
      "executive sales sponsor",
    );
  });

  it("nothing regenerates on a page view", () => {
    const workspace = src("src/components/ApplicationWorkspace.tsx");
    const consultationPage = src(
      "src/app/(app)/campaigns/[id]/consultation/page.tsx",
    );
    const summaryPage = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    expect(workspace).not.toContain("enqueueApplicationJob");
    expect(workspace).not.toContain("planConsultationWithModel");
    expect(consultationPage).not.toContain("enqueueApplicationJob");
    expect(consultationPage).not.toContain("startConsultation(");
    expect(summaryPage).not.toContain("enqueueApplicationJob");
    expect(summaryPage).not.toContain("generateCheatSheetPersonSectionGuidance");
  });
});
