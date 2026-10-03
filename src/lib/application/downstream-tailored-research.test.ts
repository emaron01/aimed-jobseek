/**
 * Downstream readers use an application's tailored employer research, including
 * the job focus, and fall back to shared company research when it does not exist.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPaidStructuredCall } from "@/lib/ai/paid-call-gate";
import {
  employerResearchModelInput,
  loadApplicationEmployerResearch,
  selectApplicationEmployerResearch,
  type ApplicationEmployerResearchView,
} from "@/lib/application/employer-research-reader";
import { employerWebsiteAnchor } from "@/lib/application/company-website";
import {
  coverLetterAssetFingerprint,
  resumeAssetFingerprint,
} from "@/lib/application-assets/paid-inputs";
import {
  buildCoverLetterAssetMessages,
  buildOutreachFactSelectionMessages,
  buildResumeAssetMessages,
} from "@/lib/application-assets/prompt";
import { outreachFactSelectionFingerprint } from "@/lib/application-assets/outreach-paid-inputs";
import { applicationSummaryShellFingerprint } from "@/lib/application-summary/shell-gate";
import {
  consultationAnswerCallFingerprint,
  consultationPlanCallFingerprint,
} from "@/lib/consultation/ai";
import { loadCoachCompanyResearch } from "@/lib/consultation/hiring-team-context";
import { buildConsultationCoachMessages, buildConsultationPolishMessages } from "@/lib/consultation/prompt";
import {
  buildRoleExpertiseAnswersMessages,
  buildRoleExpertiseQuestionsMessages,
  roleExpertiseAnswersFingerprint,
  roleExpertiseJobFingerprint,
} from "@/lib/consultation/role-expertise";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";
import {
  companyResearchEvidenceText,
  hiringTeamEvidenceExcerpts,
} from "@/lib/hiring-team/evidence";
import {
  hiringTeamIdentifyFingerprint,
  hiringTeamSynthesizeFingerprint,
} from "@/lib/hiring-team/paid-inputs";
import { applicationWorkspaceCopy } from "@/lib/product-config";
import type { ResearchSource } from "@/lib/research/types";
import { hasTestDatabase } from "@/test/database";
import { withTestTenant } from "@/test/with-test-tenant";
import {
  ApplicationCompanyBriefing,
  CheatSheetCompanyResearch,
} from "@/components/ApplicationCompanyBriefing";

const SOURCE: ResearchSource = {
  url: "https://csc.example/digital-brand",
  title: "Digital brand protection",
  publisher: "CSC",
  sourceType: "COMPANY_WEBSITE",
  retrievedAt: "2026-10-03T00:00:00.000Z",
  supports: ["companySummary", "whatTheySell", "jobFocus", "jobFocusDetail"],
};

const JOB_FOCUS = "digital brand protection, domain, and digital-risk";
const JOB_FOCUS_DETAIL = "The sales role serves that business.";

function requirement(anchorHost: string) {
  return {
    identityConfirmation: "PENDING" as const,
    companyName: "CSC",
    suppliedEmployerWebsite: `https://${anchorHost}`,
    company: {
      name: "CSC",
      website: `https://${anchorHost}`,
      normalizedDomain: anchorHost,
    },
  };
}

function tailoredRow(anchorHost: string) {
  return {
    id: "tailored-1",
    status: "COMPLETED",
    updatedAt: new Date("2026-10-03T12:00:00.000Z"),
    companySummary: "CSC highlights from the company site.",
    whatTheySell: "Digital brand and domain services.",
    customerTypes: ["enterprises"],
    businessModel: null,
    companySizeContext: null,
    hiringSignals: [],
    riskSignals: [],
    jobFocus: JOB_FOCUS,
    jobFocusDetail: JOB_FOCUS_DETAIL,
    researchSources: [SOURCE],
    researchedAt: new Date("2026-10-03T12:00:00.000Z"),
    anchorHost,
    identityAmbiguous: true,
  };
}

function sharedRow() {
  return {
    id: "shared-1",
    status: "COMPLETED",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    companySummary: "Shared company summary.",
    whatTheySell: "Shared offering.",
    customerTypes: [],
    businessModel: null,
    companySizeContext: null,
    hiringSignals: [],
    riskSignals: [],
    researchSources: [],
    researchedAt: new Date("2026-01-01T00:00:00.000Z"),
    identityAmbiguous: true,
    researchMethod: "AUTOMATED",
  };
}

const researchInput = {
  companySummary: "CSC highlights from the company site.",
  whatTheySell: "Digital brand and domain services.",
  businessModel: null,
  companySizeContext: null,
  hiringSignals: [] as string[],
  riskSignals: [] as string[],
  jobFocus: JOB_FOCUS,
  jobFocusDetail: JOB_FOCUS_DETAIL,
};

const changedResearch = { ...researchInput, jobFocus: "a different business unit" };

function assetContext(
  research: typeof researchInput | null,
): ReadyApplicationGenerationContext {
  return {
    profile: {
      identity: { fullName: "Alex Chen" },
      experience: [],
      education: [],
      skills: [],
      credentials: [],
    },
    requirement: {
      title: "Senior Director of Sales",
      companyName: "CSC",
      location: null,
      workArrangement: null,
      seniority: null,
      reportingLine: null,
      compensationRange: null,
      responsibilities: [],
      requiredItems: [],
      preferredItems: [],
      scorecard: { mission: null, outcomes: [], competencies: [] },
      rawText: "Senior Director of Sales",
    },
    companyResearch: research
      ? {
          id: "research-1",
          ...research,
          customerTypes: [],
          primaryMarkets: [],
          researchSources: [SOURCE],
          updatedAt: new Date("2026-10-03T12:00:00.000Z"),
        }
      : null,
    approvedStatements: [],
    stories: [],
    voiceSamples: [],
    sources: research
      ? [
          {
            id: "research:job-focus",
            text: research.jobFocus ?? "",
            category: "COMPANY_RESEARCH" as const,
            url: SOURCE.url,
          },
        ]
      : [],
    campaign: { applicationGuidance: null },
    persona: null,
    seekerAnswers: [],
  } as unknown as ReadyApplicationGenerationContext;
}

function job() {
  return {
    title: "Senior Director of Sales",
    companyName: "CSC",
    seniority: null,
    location: null,
    workArrangement: null,
    requiredItems: [],
    preferredItems: [],
    responsibilities: [],
    scorecardJson: { mission: null, outcomes: [], competencies: [] },
  };
}

function hiringJob() {
  return {
    title: "Senior Director of Sales",
    companyName: "CSC",
    location: null,
    workArrangement: null,
    employmentType: null,
    seniority: null,
    reportingLine: null,
    responsibilities: [] as string[],
    requiredItems: [] as string[],
    preferredItems: [] as string[],
    scorecard: { mission: null, outcomes: [], competencies: [] },
  };
}

describe("tailored employer research reader", () => {
  it("returns tailored research without confirmation, and shared research when tailored research is absent", () => {
    const anchor = employerWebsiteAnchor({
      suppliedEmployerWebsite: "https://csc.example",
    });
    expect(anchor?.domain).toBeTruthy();
    const host = anchor!.domain;
    const tailored = selectApplicationEmployerResearch({
      requirement: requirement(host),
      tailored: tailoredRow(host),
      shared: sharedRow(),
    });
    expect(tailored?.source).toBe("tailored");
    expect(tailored?.jobFocus).toBe(JOB_FOCUS);
    expect(tailored?.jobFocusDetail).toBe(JOB_FOCUS_DETAIL);
    expect(tailored?.companySummary).toContain("CSC highlights");

    const shared = selectApplicationEmployerResearch({
      requirement: { ...requirement(host), identityConfirmation: "CONFIRMED" },
      tailored: null,
      shared: { ...sharedRow(), identityAmbiguous: false },
    });
    expect(shared?.source).toBe("shared");
    expect(shared?.companySummary).toBe("Shared company summary.");
    expect(shared?.jobFocus).toBeNull();
    expect(shared?.jobFocusDetail).toBeNull();

    const rejected = selectApplicationEmployerResearch({
      requirement: { ...requirement(host), identityConfirmation: "REJECTED" },
      tailored: tailoredRow(host),
      shared: sharedRow(),
    });
    expect(rejected).toBeNull();
  });

  it("passes the job focus into Harper, why-this-company, role expertise, assets, and hiring team", () => {
    const coach = buildConsultationCoachMessages({
      targets: [],
      profileItems: [],
      careerStage: "mid_career",
      recentRoles: [],
      hiringTeam: [],
      seekerStatedFacts: [],
      companyResearch: researchInput,
      askedQuestions: [],
      chronologyRequested: false,
      coveredTargetKeys: [],
    });
    expect(coach[1]?.content).toContain(JOB_FOCUS);
    expect(coach[1]?.content).toContain(JOB_FOCUS_DETAIL);

    const polish = buildConsultationPolishMessages({
      answer: "I want to work on digital risk.",
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      whyThisCompany: true,
      companyResearch: researchInput,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
    });
    expect(polish.at(-1)?.content).toContain('"companyResearch"');
    expect(polish.at(-1)?.content).toContain(JOB_FOCUS);
    const ordinaryPolish = buildConsultationPolishMessages({
      answer: "I rebuilt the forecast.",
      story: { situation: null, task: null, action: null, result: null },
      declinedFollowUp: false,
      strengtheningNeeds: [],
      careerStage: "mid_career",
      profileItems: [],
    });
    expect(ordinaryPolish.at(-1)?.content).not.toContain("companyResearch");

    const questions = buildRoleExpertiseQuestionsMessages({
      minCount: 1,
      maxCount: 3,
      askedQuestions: [],
      chronologyAlreadyAsked: false,
      recentRoles: [],
      careerStage: "mid_career",
      jobSources: { title: "Director", employerResearch: researchInput },
    });
    expect(questions[1]?.content).toContain(JOB_FOCUS);
    const answers = buildRoleExpertiseAnswersMessages({
      questions: [
        {
          text: "How have you sold a technical service?",
          interviewTypeTag: "focused_competency",
          targetKey: "q1",
          slug: "q1",
        },
      ] as never,
      careerStage: "mid_career",
      jobSources: { employerResearch: researchInput },
      profileItems: [{ kind: "FACT", text: "I sold domain security services." }],
      libraryMatches: [],
    });
    expect(answers[1]?.content).toContain(JOB_FOCUS);
    expect(answers[1]?.content).toContain("I sold domain security services.");

    const resume = buildResumeAssetMessages({
      context: assetContext(researchInput),
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    expect(resume[1]?.content).toContain(JOB_FOCUS);
    const cover = buildCoverLetterAssetMessages({
      context: assetContext(researchInput),
      salutation: "Hello",
      regenerationInstruction: null,
      qualityFeedback: [],
    });
    expect(cover[1]?.content).toContain(JOB_FOCUS_DETAIL);
    const outreach = buildOutreachFactSelectionMessages({
      context: assetContext(researchInput),
      purpose: "PROACTIVE",
      candidates: [],
    });
    expect(outreach[1]?.content).toContain(JOB_FOCUS);

    const evidence = companyResearchEvidenceText({
      companySummary: researchInput.companySummary,
      whatTheySell: researchInput.whatTheySell,
      businessModel: null,
      hiringSignals: [],
      riskSignals: [],
      jobFocus: JOB_FOCUS,
      jobFocusDetail: JOB_FOCUS_DETAIL,
    });
    expect(evidence).toContain(JOB_FOCUS);
    expect(evidence).toContain(JOB_FOCUS_DETAIL);
  });

  it("changes each step fingerprint when the job focus changes, and keeps it stable when the input does not", () => {
    const coach = (research: typeof researchInput) =>
      consultationPlanCallFingerprint(
        buildConsultationCoachMessages({
          targets: [],
          profileItems: [],
          careerStage: "mid_career",
          recentRoles: [],
          hiringTeam: [],
          seekerStatedFacts: [],
          companyResearch: research,
          askedQuestions: [],
          chronologyRequested: false,
          coveredTargetKeys: [],
        }),
      );
    expect(coach(researchInput)).toBe(coach(researchInput));
    expect(coach(researchInput)).not.toBe(coach(changedResearch));

    const polish = (research: typeof researchInput) =>
      consultationAnswerCallFingerprint(
        buildConsultationPolishMessages({
          answer: "I want to work on digital risk.",
          story: { situation: null, task: null, action: null, result: null },
          declinedFollowUp: false,
          whyThisCompany: true,
          companyResearch: research,
          strengtheningNeeds: [],
          careerStage: "mid_career",
          profileItems: [],
        }),
      );
    expect(polish(researchInput)).toBe(polish(researchInput));
    expect(polish(researchInput)).not.toBe(polish(changedResearch));

    expect(roleExpertiseJobFingerprint(job(), researchInput)).toBe(
      roleExpertiseJobFingerprint(job(), researchInput),
    );
    expect(roleExpertiseJobFingerprint(job(), researchInput)).not.toBe(
      roleExpertiseJobFingerprint(job(), changedResearch),
    );
    expect(roleExpertiseAnswersFingerprint([], [], researchInput)).not.toBe(
      roleExpertiseAnswersFingerprint([], [], changedResearch),
    );

    const sources = (text: string) => [
      { id: "research:summary", text: "CSC highlights", category: "COMPANY" },
      { id: "research:job-focus", text, category: "COMPANY" },
    ];
    expect(applicationSummaryShellFingerprint(sources(JOB_FOCUS))).toBe(
      applicationSummaryShellFingerprint(sources(JOB_FOCUS)),
    );
    expect(applicationSummaryShellFingerprint(sources(JOB_FOCUS))).not.toBe(
      applicationSummaryShellFingerprint(sources("a different business unit")),
    );

    expect(resumeAssetFingerprint({
      context: assetContext(researchInput),
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction: null,
      qualityFeedback: [],
    })).not.toBe(resumeAssetFingerprint({
      context: assetContext(changedResearch),
      hiddenRoleIds: [],
      condensedRoleIds: [],
      regenerationInstruction: null,
      qualityFeedback: [],
    }));
    expect(coverLetterAssetFingerprint({
      context: assetContext(researchInput),
      salutation: "Hello",
      regenerationInstruction: null,
      qualityFeedback: [],
    })).toBe(coverLetterAssetFingerprint({
      context: assetContext(researchInput),
      salutation: "Hello",
      regenerationInstruction: null,
      qualityFeedback: [],
    }));
    expect(outreachFactSelectionFingerprint({
      context: assetContext(researchInput),
      purpose: "PROACTIVE",
      candidates: [],
    })).not.toBe(outreachFactSelectionFingerprint({
      context: assetContext(changedResearch),
      purpose: "PROACTIVE",
      candidates: [],
    }));

    const excerpts = (focus: string) =>
      hiringTeamEvidenceExcerpts({
        job: hiringJob(),
        includeResearch: true,
        research: {
          companySummary: "CSC highlights",
          whatTheySell: "services",
          businessModel: null,
          hiringSignals: [],
          riskSignals: [],
          jobFocus: focus,
          jobFocusDetail: JOB_FOCUS_DETAIL,
        },
      });
    expect(hiringTeamIdentifyFingerprint({ evidence: excerpts(JOB_FOCUS) })).not.toBe(
      hiringTeamIdentifyFingerprint({ evidence: excerpts("a different business unit") }),
    );
    expect(
      hiringTeamSynthesizeFingerprint({
        roleName: "Hiring manager",
        likelyTitles: ["VP Sales"],
        department: null,
        whyThisRoleMatters: null,
        involvement: "DIRECT",
        notes: null,
        rejection: [],
        excerpts: excerpts(JOB_FOCUS),
        peers: [],
      }),
    ).toBe(
      hiringTeamSynthesizeFingerprint({
        roleName: "Hiring manager",
        likelyTitles: ["VP Sales"],
        department: null,
        whyThisRoleMatters: null,
        involvement: "DIRECT",
        notes: null,
        rejection: [],
        excerpts: excerpts(JOB_FOCUS),
        peers: [],
      }),
    );
  });

  it("shows company highlights and the job focus with citations, and does not run research on a page view", () => {
    const html = renderToStaticMarkup(
      createElement(CheatSheetCompanyResearch, {
        companySummary: "CSC highlights from the company site.",
        whatTheySell: "Digital brand and domain services.",
        jobFocus: JOB_FOCUS,
        jobFocusDetail: JOB_FOCUS_DETAIL,
        sources: [SOURCE],
      }),
    );
    expect(applicationWorkspaceCopy.companyHighlightsTitle).toBe("Company highlights");
    expect(applicationWorkspaceCopy.jobFocusTitle).toBe("Where this job fits");
    expect(applicationWorkspaceCopy.jobFocusDetailTitle).toBe("In depth");
    expect(html).toContain("Company highlights");
    expect(html).toContain("Where this job fits");
    expect(html).toContain("In depth");
    expect(html).toContain(JOB_FOCUS);
    expect(html).toContain(JOB_FOCUS_DETAIL);
    expect(html).toContain(SOURCE.url);

    const briefing = renderToStaticMarkup(
      createElement(ApplicationCompanyBriefing, {
        campaignId: "campaign-1",
        canEdit: false,
        companyName: "CSC",
        meta: {
          domain: "csc.example",
          industry: null,
          location: null,
          employeeCount: null,
          revenue: null,
          lastResearched: null,
        },
        defaults: {
          companySummary: "CSC highlights from the company site.",
          whatTheySell: "Digital brand and domain services.",
          customerTypes: [],
          primaryMarkets: [],
          businessModel: null,
          companySizeContext: null,
          relevantTechnologies: [],
          hiringSignals: [],
          riskSignals: [],
          jobFocus: JOB_FOCUS,
          jobFocusDetail: JOB_FOCUS_DETAIL,
        },
        sources: [SOURCE],
        researchMethod: "AUTOMATED",
        researchStatus: "Researched",
        notes: "",
        researchLive: false,
      }),
    );
    expect(briefing).toContain(JOB_FOCUS);
    expect(briefing).toContain(JOB_FOCUS_DETAIL);
    expect(briefing).toContain(SOURCE.url);
    expect(briefing).toContain("Company highlights");
    expect(briefing).toContain("Where this job fits");
    expect(briefing).toContain("In depth");

    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const summary = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const briefingSource = readFileSync(
      "src/components/ApplicationCompanyBriefing.tsx",
      "utf8",
    );
    for (const source of [workspace, summary, briefingSource]) {
      expect(source).not.toContain("researchCompany(");
      expect(source).not.toContain("runPaidStructuredCall");
      expect(source).not.toContain("enqueueApplicationResearch");
    }
    expect(workspace).toContain("loadApplicationEmployerResearch");
    expect(summary).toContain("CheatSheetCompanyResearch");
    const whyThisCompanyInstruction =
      'When whyThisCompany is true: the answer is motivation for wanting this company, not a work story. Write one first-person interview answer to "Why do you want to work here?" using that motivation. When companyResearch is supplied, connect the person\'s motivation to the part of the company this job serves, using the company highlights as context. Company facts may come only from companyResearch; never invent them. Facts about the person come only from their answer and Personal Profile. resumeBullet is always null. Do not invent a work story or a resume bullet.';
    expect(readFileSync("src/lib/prompt-content/consultation.ts", "utf8")).toContain(
      whyThisCompanyInstruction,
    );
  });
});

describe.skipIf(!hasTestDatabase())("tailored employer research against postgres", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const host = `csc-${suffix}.example`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `downstream-research-${suffix}@example.test`,
      name: "Downstream Research",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
        profileJson: { identity: { fullName: "Alex Chen" } },
      },
    });
    productId = product.id;
  }, 60_000);

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma?.$disconnect();
  });

  async function application(name: string) {
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `${name} ${suffix}`,
        normalizedName: `${name}-${suffix}`.toLowerCase(),
        website: `https://${host}`,
        normalizedDomain: `${name}-${host}`,
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId,
        name,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        companyName: company.name,
        title: "Senior Director of Sales",
        rawText: "Senior Director of Sales",
        suppliedEmployerWebsite: `https://${host}`,
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "PENDING",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
    return { company, campaign };
  }

  it("reads tailored research without confirmation and shared research when none is stored", async () => {
    const { company, campaign } = await application("tailored");
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "COMPLETED",
        companySummary: "Shared company summary.",
        whatTheySell: "Shared offering.",
        identityAmbiguous: true,
      },
    });
    await prisma.applicationEmployerResearch.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        companyId: company.id,
        status: "COMPLETED",
        companySummary: "CSC highlights from the company site.",
        whatTheySell: "Digital brand and domain services.",
        jobFocus: JOB_FOCUS,
        jobFocusDetail: JOB_FOCUS_DETAIL,
        anchorHost: host,
        identityAmbiguous: true,
        researchSources: [SOURCE],
      },
    });
    const view = await withTestTenant(organizationId, () =>
      loadApplicationEmployerResearch({
        organizationId,
        campaignId: campaign.id,
      }),
    );
    expect(view?.source).toBe("tailored");
    expect(view?.jobFocus).toBe(JOB_FOCUS);
    const coach = await withTestTenant(organizationId, () =>
      loadCoachCompanyResearch(organizationId, campaign.id),
    );
    expect(coach?.jobFocus).toBe(JOB_FOCUS);
    expect(coach?.jobFocusDetail).toBe(JOB_FOCUS_DETAIL);
    expect(employerResearchModelInput(view as ApplicationEmployerResearchView).jobFocus).toBe(
      JOB_FOCUS,
    );

    const fallback = await application("shared-only");
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: fallback.company.id,
        status: "COMPLETED",
        companySummary: "Shared company summary.",
        whatTheySell: "Shared offering.",
        identityAmbiguous: false,
      },
    });
    await prisma.jobRequirement.update({
      where: { campaignId: fallback.campaign.id },
      data: { identityConfirmation: "CONFIRMED" },
    });
    const shared = await withTestTenant(organizationId, () =>
      loadApplicationEmployerResearch({
        organizationId,
        campaignId: fallback.campaign.id,
      }),
    );
    expect(shared?.source).toBe("shared");
    expect(shared?.companySummary).toBe("Shared company summary.");
    expect(shared?.jobFocus).toBeNull();
  });

  it("makes no paid call when the fingerprint is unchanged, and pays when research changes", async () => {
    const subjectKey = `downstream-${suffix}`;
    const same = roleExpertiseJobFingerprint(job(), researchInput);
    const changed = roleExpertiseJobFingerprint(job(), changedResearch);
    let calls = 0;
    const provider = async () => {
      calls += 1;
      return { ok: true };
    };
    const first = await withTestTenant(organizationId, () =>
      runPaidStructuredCall({
        organizationId,
        operation: "ROLE_EXPERTISE_QUESTIONS",
        subjectKey,
        inputFingerprint: same,
        isResultUsable: () => true,
        parseStored: (json) => json as { ok: boolean },
        callProvider: provider,
      }),
    );
    expect(first.skipped).toBe(false);
    expect(calls).toBe(1);
    const second = await withTestTenant(organizationId, () =>
      runPaidStructuredCall({
        organizationId,
        operation: "ROLE_EXPERTISE_QUESTIONS",
        subjectKey,
        inputFingerprint: same,
        isResultUsable: () => true,
        parseStored: (json) => json as { ok: boolean },
        callProvider: provider,
      }),
    );
    expect(second.skipped).toBe(true);
    expect(calls).toBe(1);
    const third = await withTestTenant(organizationId, () =>
      runPaidStructuredCall({
        organizationId,
        operation: "ROLE_EXPERTISE_QUESTIONS",
        subjectKey,
        inputFingerprint: changed,
        isResultUsable: () => true,
        parseStored: (json) => json as { ok: boolean },
        callProvider: provider,
      }),
    );
    expect(third.skipped).toBe(false);
    expect(calls).toBe(2);
  }, 30_000);
});
