/**
 * Harper three-section default page (Where you stand / needs info / best practice).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildHarperQaLayout,
  partitionGeneralQuestionsForStanding,
} from "@/lib/consultation/harper-layout";
import {
  buildConsultationQaView,
  consultationQuestionAcceptsReply,
  type ConsultationQaItem,
  type QaTurn,
} from "@/lib/consultation/qa-view";
import { buildStandingListEntries } from "@/lib/consultation/standing-entries";
import {
  collectThreeSectionQuestionTurnIds,
  harperSectionForQuestion,
  partitionHarperThreeSections,
  questionHasApprovedResult,
} from "@/lib/consultation/harper-three-sections";
import {
  bestPracticeInterviewTitle,
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config/consultation";
import {
  CHRONOLOGY_TARGET_KEY,
  WHY_THIS_COMPANY_TARGET_KEY,
} from "@/lib/consultation/contract";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function turn(
  overrides: Partial<QaTurn> & Pick<QaTurn, "id" | "speaker" | "body" | "sequence">,
): QaTurn {
  return {
    targetKey: null,
    followUp: false,
    ...overrides,
  };
}

function qaItem(
  overrides: Partial<ConsultationQaItem> &
    Pick<ConsultationQaItem, "questionTurnId" | "question" | "targetKey">,
): ConsultationQaItem {
  return {
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    ignored: false,
    needsMoreDetail: false,
    ...overrides,
  };
}

describe("Harper three-section page copy and chrome", () => {
  it("uses the exact intro, section titles, and descriptions", () => {
    expect(consultationConversationCopy.pageIntro).toBe(
      "Harper helps you prepare the answers you'll use throughout this application. What you approve here is what she uses to build your resume, cover letter, outreach, and Interview Preparation Guides. Answer what you can, skip what you can't, review her suggestions, and approve what best represents your background in a professional way. When it's time to interview, your Interview Preparation Guides bring it all together.",
    );
    expect(consultationConversationCopy.whereYouStand).toBe("Where you stand");
    expect(consultationConversationCopy.whereYouStandDescription).toBe(
      "How your experience matches this job, requirement by requirement.",
    );
    expect(consultationConversationCopy.needsMoreInfoTitle).toBe(
      "Questions that need more information",
    );
    expect(consultationConversationCopy.needsMoreInfoDescription).toBe(
      "Harper needs a little more from you on these. Your answers fill the gaps in Where you stand.",
    );
    expect(
      bestPracticeInterviewTitle("Senior Director of Sales - North America"),
    ).toBe(
      "Best-practice interview questions for a Senior Director of Sales - North America",
    );
    expect(consultationConversationCopy.bestPracticeDescription).toBe(
      "Questions a hiring manager for this role commonly asks, with Harper's suggested answers drawn from your profile. Edit them to make them yours, then approve.",
    );

    const section = src("src/components/ConsultationSection.tsx");
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(section).toContain("consultationConversationCopy.pageIntro");
    expect(section).toContain('data-testid="harper-page-intro"');
    expect(section).toContain("jobTitle={campaign?.jobRequirement?.title");
    expect(standing).toContain("harper-section-standing");
    expect(standing).toContain("harper-section-needs-info");
    expect(standing).toContain("harper-section-best-practice");
    expect(standing).toContain("bestPracticeInterviewTitle(jobTitle)");
    expect(standing).toContain("whereYouStandDescription");
    expect(standing).toContain("needsMoreInfoDescription");
    expect(standing).toContain("bestPracticeDescription");
    // All three start open.
    expect(standing).toContain("HARPER_SECTION_IDS.standing");
    expect(standing).toContain("HARPER_SECTION_IDS.needsInfo");
    expect(standing).toContain("HARPER_SECTION_IDS.bestPractice");
    expect(standing).toMatch(
      /new Set\(\[\s*HARPER_SECTION_IDS\.standing,\s*HARPER_SECTION_IDS\.needsInfo,\s*HARPER_SECTION_IDS\.bestPractice/,
    );
    // Description renders in the heading (visible while collapsed).
    expect(standing).toContain("data-testid={`${testId}-description`}");
    expect(standing).toContain("aria-expanded={open}");
  });

  it("collapses and expands by heading and opens a section for question anchors", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(standing).toContain("onToggle={() => toggleSection");
    expect(standing).toContain("ensureSectionOpen(section)");
    expect(standing).toContain('hash.startsWith("harper-q:")');
    expect(standing).toContain("sectionByQuestionTurnId.get(turnId)");
    expect(standing).toContain("harperQuestionAnchorId(turnId)");
  });
});

describe("Harper three-section partition", () => {
  const draftGap = qaItem({
    questionTurnId: "q-gap",
    question: "Tell me about leading incidents.",
    targetKey: "required:0",
    talkingPoint: {
      id: "st-draft",
      turnId: "q-gap",
      kind: "INTERVIEW_ANSWER",
      status: "DRAFT",
      content: "I led SEV1 response.",
      strengtheningNote: null,
    },
  });
  const approvedGap = qaItem({
    ...draftGap,
    questionTurnId: "q-gap-approved",
    talkingPoint: {
      id: "st-ok",
      turnId: "q-gap-approved",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "I led SEV1 response and cut MTTR.",
      strengtheningNote: null,
    },
  });
  const approvedWhy = qaItem({
    questionTurnId: "q-why",
    question: consultationConversationCopy.whyThisCompanyTarget,
    targetKey: WHY_THIS_COMPANY_TARGET_KEY,
    talkingPoint: {
      id: "st-why",
      turnId: "q-why",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "Their robotics mission matches my reliability work.",
      strengtheningNote: null,
    },
  });
  const openWhy = qaItem({
    questionTurnId: "q-why-open",
    question: consultationConversationCopy.whyThisCompanyTarget,
    targetKey: WHY_THIS_COMPANY_TARGET_KEY,
  });
  const approvedCareer = qaItem({
    questionTurnId: "q-career",
    question: consultationConversationCopy.careerWalkThroughTarget,
    targetKey: CHRONOLOGY_TARGET_KEY,
    talkingPoint: {
      id: "st-career",
      turnId: "q-career",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "I started in support and grew into engineering leadership.",
      strengtheningNote: null,
    },
  });
  const roleDraft = qaItem({
    questionTurnId: "q-role",
    question: "What would your first 90 days look like?",
    targetKey: "role-expertise:first-90",
    talkingPoint: {
      id: "st-role",
      turnId: "q-role",
      kind: "INTERVIEW_ANSWER",
      status: "DRAFT",
      content: "Map the pipeline and ship one forecast win.",
      strengtheningNote: null,
    },
  });
  const roleApproved = qaItem({
    ...roleDraft,
    questionTurnId: "q-role-ok",
    talkingPoint: {
      id: "st-role-ok",
      turnId: "q-role-ok",
      kind: "INTERVIEW_ANSWER",
      status: "APPROVED",
      content: "Map the pipeline and ship one forecast win.",
      strengtheningNote: null,
    },
  });
  const ignoredGap = qaItem({
    questionTurnId: "q-ignored",
    question: "Describe partnering with Marketing.",
    targetKey: "required:1",
    ignored: true,
  });

  it("keeps a partial row's draft question in the row, with its controls, and out of Section 2", () => {
    expect(harperSectionForQuestion(draftGap)).toBe("where-you-stand");
    expect(harperSectionForQuestion(approvedGap)).toBe("where-you-stand");
    expect(questionHasApprovedResult(approvedGap)).toBe(true);
    expect(consultationQuestionAcceptsReply(draftGap)).toBe(true);

    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "PARTIAL",
          kind: "REQUIRED",
          explanation: "Partial coverage",
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [],
      questionsByTargetKey: new Map([
        ["required:0", [draftGap]],
      ]),
    });
    const withDraft = partitionHarperThreeSections(entries);
    expect(withDraft.needsInfoQuestions).toEqual([]);
    expect(withDraft.standingEntries[0]?.questions.map((q) => q.questionTurnId)).toEqual([
      "q-gap",
    ]);
    expect(withDraft.standingEntries[0]?.questions[0]?.question).toBe(
      "Tell me about leading incidents.",
    );
    expect(withDraft.standingEntries[0]?.questions[0]?.talkingPoint?.content).toBe(
      "I led SEV1 response.",
    );
    expect(withDraft.standingEntries[0]?.showShareForm).toBe(false);

    const standing = src("src/components/ConsultationStanding.tsx");
    const explanationAt = standing.indexOf("entry.explanation");
    const questionListAt = standing.indexOf("<QuestionList");
    expect(explanationAt).toBeGreaterThan(-1);
    expect(questionListAt).toBeGreaterThan(explanationAt);

    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain(
      "const canSkip = canEdit && actionsEnabled && !item.ignored && !approved",
    );
    expect(thread).toContain("consultationConversationCopy.threadReply");
    expect(thread).toContain("consultationConversationCopy.approve");
    expect(thread).toContain("polishCopy.regenerate");
    expect(thread).toContain("consultationConversationCopy.editAnswer");
    expect(thread).toContain("consultationConversationCopy.skipQuestion");
    expect(thread).toContain("consultationConversationCopy.ignoreQuestion");

    const approvedEntries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "PARTIAL",
          kind: "REQUIRED",
          explanation: "Partial coverage",
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [],
      questionsByTargetKey: new Map([["required:0", [approvedGap]]]),
    });
    const withApproved = partitionHarperThreeSections(approvedEntries);
    expect(withApproved.needsInfoQuestions).toEqual([]);
    expect(withApproved.standingEntries).toHaveLength(1);
    expect(withApproved.standingEntries[0]?.questions.map((q) => q.questionTurnId)).toEqual([
      "q-gap-approved",
    ]);
    expect(
      withApproved.standingEntries[0]?.questions[0]?.talkingPoint?.status,
    ).toBe("APPROVED");
  });

  it("puts approved why-this-company and career walk-through in Section 1 as their own entries", () => {
    const entries = buildStandingListEntries({
      requirements: [],
      dedicatedTopics: [
        {
          kind: "why-this-company",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          label: consultationConversationCopy.whyThisCompanyTarget,
          questions: [approvedWhy],
        },
        {
          kind: "chronology",
          targetKey: CHRONOLOGY_TARGET_KEY,
          label: consultationConversationCopy.careerWalkThroughTarget,
          questions: [approvedCareer],
        },
      ],
      questionsByTargetKey: new Map(),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.needsInfoQuestions).toEqual([]);
    const keys = model.standingEntries.map((e) => e.targetKey).sort();
    expect(keys).toEqual([CHRONOLOGY_TARGET_KEY, WHY_THIS_COMPANY_TARGET_KEY].sort());
    expect(
      model.standingEntries.flatMap((e) => e.questions.map((q) => q.questionTurnId)).sort(),
    ).toEqual(["q-career", "q-why"]);
  });

  it("keeps an open career walk-through in Section 2 and a partial-row question in the row", () => {
    const openCareer = qaItem({
      questionTurnId: "q-career-open",
      question: consultationConversationCopy.careerWalkThroughTarget,
      targetKey: CHRONOLOGY_TARGET_KEY,
    });
    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "NONE",
          kind: "REQUIRED",
          explanation: null,
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [
        {
          kind: "chronology",
          targetKey: CHRONOLOGY_TARGET_KEY,
          label: consultationConversationCopy.careerWalkThroughTarget,
          questions: [openCareer],
        },
      ],
      questionsByTargetKey: new Map([["required:0", [draftGap]]]),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.needsInfoQuestions.map((q) => q.questionTurnId)).toEqual([
      "q-career-open",
    ]);
    expect(model.standingEntries[0]?.questions.map((q) => q.questionTurnId)).toEqual([
      "q-gap",
    ]);
    expect(
      model.standingEntries.some((entry) => entry.targetKey === CHRONOLOGY_TARGET_KEY),
    ).toBe(false);
  });

  it("keeps open why-this-company in Section 2 only", () => {
    const entries = buildStandingListEntries({
      requirements: [],
      dedicatedTopics: [
        {
          kind: "why-this-company",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          label: consultationConversationCopy.whyThisCompanyTarget,
          questions: [openWhy],
        },
      ],
      questionsByTargetKey: new Map(),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.standingEntries).toEqual([]);
    expect(model.needsInfoQuestions.map((q) => q.questionTurnId)).toEqual([
      "q-why-open",
    ]);
  });

  it("puts role-expertise only in Section 3, including when approved", () => {
    expect(harperSectionForQuestion(roleDraft)).toBe("best-practice");
    expect(harperSectionForQuestion(roleApproved)).toBe("best-practice");
    const entries = buildStandingListEntries({
      requirements: [],
      dedicatedTopics: [
        {
          kind: "role-expertise",
          targetKey: "role-expertise:first-90",
          label: "Role expertise",
          questions: [roleDraft, roleApproved],
        },
      ],
      questionsByTargetKey: new Map(),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.standingEntries).toEqual([]);
    expect(model.needsInfoQuestions).toEqual([]);
    expect(model.bestPracticeQuestions.map((q) => q.questionTurnId).sort()).toEqual([
      "q-role",
      "q-role-ok",
    ]);
    expect(model.bestPracticeQuestions[0]?.talkingPoint?.status).toBe("DRAFT");
  });

  it("keeps ignored items in Section 2", () => {
    expect(harperSectionForQuestion(ignoredGap)).toBe("needs-more-info");
    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a1",
          targetKey: "required:1",
          text: "Partners with Marketing",
          strength: "NONE",
          kind: "REQUIRED",
          explanation: null,
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [],
      questionsByTargetKey: new Map([["required:1", [ignoredGap]]]),
    });
    const model = partitionHarperThreeSections(entries);
    expect(model.needsInfoQuestions.map((q) => q.questionTurnId)).toEqual([
      "q-ignored",
    ]);
    expect(model.standingEntries[0]?.questions).toEqual([]);
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(standing).toContain("collapseWhenIgnored");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("collapseWhenIgnored");
    expect(thread).toContain('data-harper-collapsed="ignored"');
    expect(thread).toContain("reopenIgnored");
  });

  it("renders each question exactly once across the three sections", () => {
    const view = buildConsultationQaView({
      turns: [
        turn({
          id: "q-gap",
          speaker: "CONSULTANT",
          body: "Tell me about incidents.",
          targetKey: "required:0",
          sequence: 1,
        }),
        turn({
          id: "q-role",
          speaker: "CONSULTANT",
          body: "First 90 days?",
          targetKey: "role-expertise:first-90",
          sequence: 2,
        }),
        turn({
          id: "q-why",
          speaker: "CONSULTANT",
          body: consultationConversationCopy.whyThisCompanyTarget,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          sequence: 3,
        }),
      ],
      statements: [
        {
          id: "st1",
          turnId: "q-gap",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: "Approved gap answer.",
          strengtheningNote: null,
        },
        {
          id: "st2",
          turnId: "q-role",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "Suggested role answer.",
          strengtheningNote: null,
        },
      ],
    });
    const entries = buildStandingListEntries({
      requirements: [
        {
          id: "a0",
          targetKey: "required:0",
          text: "Leads incident response",
          strength: "PARTIAL",
          kind: "REQUIRED",
          explanation: null,
          experience: null,
          facts: [],
        },
      ],
      dedicatedTopics: [
        {
          kind: "why-this-company",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          label: consultationConversationCopy.whyThisCompanyTarget,
          questions: view.questions.filter(
            (q) => q.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
          ),
        },
        {
          kind: "role-expertise",
          targetKey: "role-expertise:first-90",
          label: "Role expertise",
          questions: view.questions.filter((q) =>
            q.targetKey?.startsWith("role-expertise:"),
          ),
        },
      ],
      questionsByTargetKey: new Map([
        [
          "required:0",
          view.questions.filter((q) => q.targetKey === "required:0"),
        ],
      ]),
    });
    const model = partitionHarperThreeSections(entries);
    const ids = collectThreeSectionQuestionTurnIds(model);
    expect(ids.sort()).toEqual(["q-gap", "q-role", "q-why"].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("approved collapsed cards show Interview answer wiring and Approved badge", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("collapseWhenApproved");
    expect(thread).toContain('data-testid="consultation-approved-badge"');
    expect(thread).toContain("consultationStatementLabels.APPROVED");
    expect(consultationStatementLabels.APPROVED).toBe("Approved");
    expect(consultationStatementLabels.INTERVIEW_ANSWER).toBe("Interview answer");
    expect(consultationConversationCopy.showApprovedAnswer).toBe(
      "Show approved answer",
    );
  });
});

describe("older stored application shape", () => {
  it("renders a CSC-shaped application's questions, drafts, and approvals once in the new layout", () => {
    const campaignId = "cmuna46te0019r52o11wi0zm0";
    const view = buildConsultationQaView({
      turns: [
        turn({
          id: "csc-shift",
          speaker: "CONSULTANT",
          body: "Tell me about a recent enterprise SaaS market shift you led.",
          targetKey: "required:0",
          sequence: 1,
        }),
        turn({
          id: "csc-sql",
          speaker: "CONSULTANT",
          body: "How do you build SQL reporting for the warehouse?",
          targetKey: "required:1",
          sequence: 2,
        }),
        turn({
          id: "csc-coach",
          speaker: "CONSULTANT",
          body: "Tell me about a time you coached an underperforming seller.",
          targetKey: "required:2",
          sequence: 3,
        }),
        turn({
          id: "csc-coach-reply",
          speaker: "SEEKER",
          body: "At OpenText I coached two sellers who then hit quota.",
          targetKey: "required:2",
          sequence: 4,
          analysisJson: { status: "COMPLETE", replyToTurnId: "csc-coach" },
        }),
        turn({
          id: "csc-why",
          speaker: "CONSULTANT",
          body: consultationConversationCopy.whyThisCompanyTarget,
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          sequence: 5,
        }),
        turn({
          id: "csc-why-reply",
          speaker: "SEEKER",
          body: "I want this sales leadership role because the motion matches how I already sell.",
          targetKey: WHY_THIS_COMPANY_TARGET_KEY,
          sequence: 6,
          analysisJson: { status: "COMPLETE", replyToTurnId: "csc-why" },
        }),
        turn({
          id: "csc-career",
          speaker: "CONSULTANT",
          body: consultationConversationCopy.careerWalkThroughTarget,
          targetKey: CHRONOLOGY_TARGET_KEY,
          sequence: 7,
        }),
        turn({
          id: "csc-role",
          speaker: "CONSULTANT",
          body: "What would your first 90 days look like?",
          targetKey: "role-expertise:first-90",
          sequence: 8,
        }),
      ],
      statements: [
        {
          id: "csc-shift-draft",
          turnId: "csc-shift",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "I would convene Sales, Product, Marketing, and Customer Success.",
          strengtheningNote: null,
        },
        {
          id: "csc-coach-approved",
          turnId: "csc-coach-reply",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content: "At OpenText I coached two sellers who then hit quota.",
          strengtheningNote: null,
        },
        {
          id: "csc-why-approved",
          turnId: "csc-why-reply",
          kind: "INTERVIEW_ANSWER",
          status: "APPROVED",
          content:
            "I want this sales leadership role because the motion matches how I already sell.",
          strengtheningNote: null,
        },
        {
          id: "csc-role-draft",
          turnId: "csc-role",
          kind: "INTERVIEW_ANSWER",
          status: "DRAFT",
          content: "In the first 90 days I would map the pipeline and ship one forecast win.",
          strengtheningNote: null,
        },
      ],
    });
    const storedAssessments = [
      {
        id: "csc-a0",
        targetKey: "required:0",
        text: "Enterprise sales leadership",
        strength: "PARTIAL" as const,
        kind: "REQUIRED" as const,
        explanation: "You clearly meet the experience and leadership scope.",
      },
      {
        id: "csc-a1",
        targetKey: "required:1",
        text: "SQL reporting for the warehouse",
        strength: "NONE" as const,
        kind: "REQUIRED" as const,
        explanation: "Nothing stated covers warehouse reporting.",
      },
      {
        id: "csc-a2",
        targetKey: "required:2",
        text: "Coaching underperforming sellers",
        strength: "PARTIAL" as const,
        kind: "REQUIRED" as const,
        explanation: "The OpenText coaching story covers this.",
      },
      {
        id: "csc-why-row",
        targetKey: WHY_THIS_COMPANY_TARGET_KEY,
        text: consultationConversationCopy.whyThisCompanyTarget,
        strength: "PARTIAL" as const,
        kind: "REQUIRED" as const,
        explanation: "A reason for this company is still thin.",
      },
    ];
    const layout = buildHarperQaLayout({
      questions: view.questions,
      interviewers: [],
    });
    const standingInline = partitionGeneralQuestionsForStanding({
      general: layout.general,
      requirementTargetKeys: storedAssessments.map((item) => item.targetKey),
      requirementLabels: new Map(
        storedAssessments.map((item) => [item.targetKey, item.text]),
      ),
    });
    const questionsByTargetKey = new Map(
      storedAssessments.map((item) => [
        item.targetKey,
        standingInline.byRequirementKey.get(item.targetKey) ?? [],
      ]),
    );
    const model = partitionHarperThreeSections(
      buildStandingListEntries({
        requirements: storedAssessments.map((item) => ({
          id: item.id,
          targetKey: item.targetKey,
          text: item.text,
          strength: item.strength,
          kind: item.kind,
          explanation: item.explanation,
          experience: null,
          facts: [],
        })),
        dedicatedTopics: standingInline.dedicatedTopics,
        questionsByTargetKey,
      }),
    );
    const rendered = collectThreeSectionQuestionTurnIds(model);
    const sourceIds = view.questions.map((item) => item.questionTurnId);
    expect(rendered.sort()).toEqual(sourceIds.sort());
    expect(new Set(rendered).size).toBe(rendered.length);
    expect(campaignId).toBe("cmuna46te0019r52o11wi0zm0");

    const shift = model.standingEntries
      .find((entry) => entry.targetKey === "required:0")
      ?.questions.find((item) => item.questionTurnId === "csc-shift");
    expect(shift?.talkingPoint?.status).toBe("DRAFT");
    expect(shift?.talkingPoint?.content).toContain("I would convene");
    expect(model.needsInfoQuestions.map((item) => item.questionTurnId)).not.toContain(
      "csc-shift",
    );

    const sql = model.standingEntries
      .find((entry) => entry.targetKey === "required:1")
      ?.questions.find((item) => item.questionTurnId === "csc-sql");
    expect(sql?.question).toContain("SQL reporting");
    expect(sql?.talkingPoint).toBeNull();

    const coach = model.standingEntries
      .find((entry) => entry.targetKey === "required:2")
      ?.questions.find((item) => item.questionTurnId === "csc-coach");
    expect(coach?.talkingPoint?.status).toBe("APPROVED");
    expect(coach?.talkingPoint?.content).toContain("OpenText");

    const why = model.standingEntries.find(
      (entry) => entry.targetKey === WHY_THIS_COMPANY_TARGET_KEY,
    );
    expect(why?.questions.map((item) => item.questionTurnId)).toEqual(["csc-why"]);
    expect(why?.questions[0]?.talkingPoint?.status).toBe("APPROVED");
    expect(model.needsInfoQuestions.map((item) => item.questionTurnId)).not.toContain(
      "csc-why",
    );

    expect(model.needsInfoQuestions.map((item) => item.questionTurnId)).toEqual([
      "csc-career",
    ]);
    expect(model.bestPracticeQuestions.map((item) => item.questionTurnId)).toEqual([
      "csc-role",
    ]);
    expect(model.bestPracticeQuestions[0]?.talkingPoint?.status).toBe("DRAFT");
    expect(
      model.standingEntries.some((entry) =>
        entry.questions.some((item) => item.questionTurnId === "csc-role"),
      ),
    ).toBe(false);
  });
});

describe("render safety and existing Harper behaviors still present", () => {
  it("standing / thread / section render make no paid call and enqueue no job", () => {
    for (const rel of [
      "src/components/ConsultationSection.tsx",
      "src/components/ConsultationStanding.tsx",
      "src/components/ConsultationThread.tsx",
      "src/lib/consultation/harper-three-sections.ts",
    ]) {
      const body = src(rel);
      expect(body).not.toContain("runPaidStructuredCall");
      expect(body).not.toContain("enqueueApplicationJob");
      expect(body).not.toContain("processConsultationReply");
    }
  });

  it("keeps reply attachment, drafts, scroll, one button row, and processing notice", () => {
    const service = src("src/lib/consultation/service.ts");
    expect(service).toContain("primaryQuestionTurnIdForSeekerReply");
    const draft = src("src/components/HarperDraftStore.tsx");
    expect(draft).toContain("HarperDraftProvider");
    const form = src("src/components/ApplicationActionForm.tsx");
    expect(form).toContain("preserveScroll");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain("consultation-question-actions");
    expect(thread).toContain("processingCanTakeMinutes");
    expect(thread).toContain("compact");
  });
});
