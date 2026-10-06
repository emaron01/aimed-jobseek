import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    consultationStatement: { findMany },
  },
}));

import { profileEvidenceForApplication, whyThisCompanyFactId } from "@/lib/consultation/assess";
import { WHY_THIS_COMPANY_TARGET_KEY } from "@/lib/consultation/contract";
import {
  findHarperLibraryMatch,
  selectApprovedAnswersForTargets,
  type ApprovedAnswerCandidate,
} from "@/lib/consultation/harper-library";
import {
  buildConsultationExtractMessages,
  buildConsultationPlanDecisionMessages,
  buildConsultationPolishMessages,
} from "@/lib/consultation/prompt";
import { buildRoleExpertiseAnswersMessages } from "@/lib/consultation/role-expertise";
import { appendConfirmedFact } from "@/lib/consultation/write-back";
import { profileFactSourcesForApplication } from "@/lib/generation/context";
import { emptyCandidateProfile } from "@/lib/product-research/candidate-profile";

const CSC_ID = "cmuna46te0019r52o11wi0zm0";
const SIFT_ID = "sift-application";
const CSC_REASON = "I want to join CSC because of its domain-security work.";
const SIFT_REASON = "I want Sift because of its fraud-prevention mission.";
const FORECAST = "I rebuilt the weekly forecast review at OpenText.";
const FORECAST_QUESTION = "How do you run a weekly sales forecast review with the team?";

function sharedProfile() {
  return appendConfirmedFact(
    appendConfirmedFact(emptyCandidateProfile(), {
      id: whyThisCompanyFactId(CSC_ID),
      text: CSC_REASON,
      turnId: WHY_THIS_COMPANY_TARGET_KEY,
    }),
    {
      id: "skill-forecast",
      text: FORECAST,
      turnId: "turn-forecast",
    },
  );
}

function payloadsFor(campaignId: string, whyThisCompany: string | null) {
  const profileItems = profileEvidenceForApplication(sharedProfile(), {
    campaignId,
    whyThisCompany,
  });
  const plan = buildConsultationPlanDecisionMessages({
    targets: [
      { key: WHY_THIS_COMPANY_TARGET_KEY, kind: "MISSION", text: "Why this company" },
    ],
    profileItems,
    careerStage: "late_career",
    recentRoles: [],
    hiringTeam: [],
    seekerStatedFacts: [],
    companyResearch: null,
    askedQuestions: [],
    chronologyRequested: false,
    coveredTargetKeys: [],
  });
  const extract = buildConsultationExtractMessages({
    answer: "I led enterprise sales teams.",
    question: "Tell me about a time you led a team.",
    target: { key: "required:leadership", kind: "REQUIRED", text: "enterprise sales leadership" },
    targets: [
      { key: "required:leadership", kind: "REQUIRED", text: "enterprise sales leadership" },
    ],
    profileItems,
  });
  const polish = buildConsultationPolishMessages({
    answer: "I led enterprise sales teams.",
    story: { situation: null, task: null, action: null, result: null },
    declinedFollowUp: false,
    strengtheningNeeds: [],
    careerStage: "late_career",
    profileItems,
  });
  const drafting = buildRoleExpertiseAnswersMessages({
    questions: [
      {
        text: FORECAST_QUESTION,
        targetKey: "role-expertise:forecast",
        interviewTypeTag: "focused_competency",
      },
    ],
    careerStage: "late_career",
    jobSources: { title: "VP Sales", companyName: "Sift" },
    profileItems,
  });
  const sources = profileFactSourcesForApplication({
    profile: sharedProfile(),
    campaignId,
    whyThisCompany,
  });
  return JSON.stringify({ plan, extract, polish, drafting, sources });
}

describe("why-this-company stays on its own application", () => {
  it("keeps another application's answer out of planning and drafting inputs", () => {
    const sift = payloadsFor(SIFT_ID, SIFT_REASON);
    expect(sift).not.toContain(CSC_REASON);
    expect(sift).not.toContain(whyThisCompanyFactId(CSC_ID));
    expect(sift).toContain(SIFT_REASON);
    expect(sift).toContain(whyThisCompanyFactId(SIFT_ID));
    expect(sift).toContain(FORECAST);

    const csc = payloadsFor(CSC_ID, CSC_REASON);
    expect(csc).toContain(CSC_REASON);
    expect(csc).toContain(whyThisCompanyFactId(CSC_ID));
    expect(csc).not.toContain(SIFT_REASON);
    expect(csc).toContain(FORECAST);
  });

  it("uses the owning application's stored answer when the campaign field is set and the profile fact is absent", () => {
    const items = profileEvidenceForApplication(emptyCandidateProfile(), {
      campaignId: SIFT_ID,
      whyThisCompany: SIFT_REASON,
    });
    expect(items.map((item) => item.id)).toEqual([whyThisCompanyFactId(SIFT_ID)]);
    expect(items[0]?.text).toBe(SIFT_REASON);

    const sources = profileFactSourcesForApplication({
      profile: emptyCandidateProfile(),
      campaignId: SIFT_ID,
      whyThisCompany: SIFT_REASON,
    });
    expect(sources).toEqual([
      {
        id: whyThisCompanyFactId(SIFT_ID),
        text: SIFT_REASON,
        category: "PROFILE_FACT",
        url: null,
      },
    ]);
  });

  it("does not pass another application's why-this-company answer through approved answers or the library", async () => {
    const why: ApprovedAnswerCandidate = {
      statementId: "why-stmt",
      question: "Why do you want to work at CSC?",
      content: CSC_REASON,
      approvedAt: new Date("2026-08-01T00:00:00.000Z"),
      sourceCampaignId: CSC_ID,
      targetKey: WHY_THIS_COMPANY_TARGET_KEY,
      whyThisCompany: CSC_REASON,
    };
    const forecast: ApprovedAnswerCandidate = {
      statementId: "forecast-stmt",
      question: FORECAST_QUESTION,
      content: FORECAST,
      approvedAt: new Date("2026-07-01T00:00:00.000Z"),
      sourceCampaignId: CSC_ID,
      targetKey: "required:forecast",
      whyThisCompany: CSC_REASON,
    };
    const selected = selectApprovedAnswersForTargets({
      campaignId: SIFT_ID,
      targets: [
        { key: WHY_THIS_COMPANY_TARGET_KEY, text: "Why this company" },
        { key: "required:forecast", text: FORECAST_QUESTION },
      ],
      answers: [why, forecast],
    });
    expect(selected.map((item) => item.statementId)).toEqual(["forecast-stmt"]);
    expect(JSON.stringify(selected)).not.toContain(CSC_REASON);

    findMany.mockResolvedValue([
      {
        id: "why-stmt",
        content: CSC_REASON,
        approvedAt: new Date("2026-08-01T00:00:00.000Z"),
        turn: {
          body: FORECAST_QUESTION,
          questionContextJson: null,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
        session: { campaign: { whyThisCompany: CSC_REASON } },
      },
      {
        id: "forecast-stmt",
        content: FORECAST,
        approvedAt: new Date("2026-07-01T00:00:00.000Z"),
        turn: {
          body: FORECAST_QUESTION,
          questionContextJson: null,
          targetKey: "required:forecast",
        },
        session: { campaign: { whyThisCompany: CSC_REASON } },
      },
    ]);
    const match = await findHarperLibraryMatch({
      organizationId: "org-1",
      campaignId: SIFT_ID,
      question: FORECAST_QUESTION,
    });
    expect(match?.statementId).toBe("forecast-stmt");
    expect(match?.content).toBe(FORECAST);

    findMany.mockResolvedValue([
      {
        id: "why-only",
        content: CSC_REASON,
        approvedAt: new Date("2026-08-01T00:00:00.000Z"),
        turn: {
          body: "Why do you want to work at this company?",
          questionContextJson: null,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        },
        session: { campaign: { whyThisCompany: CSC_REASON } },
      },
    ]);
    const whyOnly = await findHarperLibraryMatch({
      organizationId: "org-1",
      campaignId: SIFT_ID,
      question: "Why do you want to work at this company?",
    });
    expect(whyOnly).toBeNull();
  });
});
