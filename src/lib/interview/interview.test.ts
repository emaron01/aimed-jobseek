import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  addBusinessDays,
  checkInDueAt,
  thankYouDueAt,
} from "@/lib/cadence/application-reminders";
import {
  limitClarifyingQuestions,
  missingGuideMaterial,
  parseClarifyingQuestions,
  rolesMissingLeaveReason,
  validateInterviewGuideContent,
  type InterviewGuideContent,
} from "@/lib/interview/guide";
import { buildInterviewGuideMessages } from "@/lib/interview/prompt";
import {
  addInterviewStageInterviewer,
  createInterviewStage,
  detectInterviewNoteGap,
  updateInterviewStage,
} from "@/lib/interview/stages";
import { validateRepetitionAndMetaLanguage } from "@/lib/consultation/output-quality";
import { interviewConfig } from "@/lib/product-config";
import { redirectLineErrors, thankYouNotesErrors } from "@/lib/application-assets/outreach";
import { hasTestDatabase } from "@/test/database";

function claim(id: string, text: string, sourceId?: string): InterviewGuideContent["purpose"] {
  return {
    id,
    text,
    supports: sourceId
      ? [{ sourceId, quote: text.slice(0, Math.min(12, text.length)) }]
      : [],
  };
}

describe("interview guide rules", () => {
  it("allows the same metric in different sections and rejects it inside one section", () => {
    const talkingPoint = "Lead with the 2 production incidents you owned at Northwind.";
    const exampleAnswer =
      "I owned 2 production incidents at Northwind and wrote the runbook the on-call team still uses.";
    const repeatedInside =
      "Lead with the 2 production incidents. Repeat the 2 production incidents without adding information.";
    expect(
      validateRepetitionAndMetaLanguage({ text: talkingPoint, bannedPhrases: [] }),
    ).toEqual([]);
    expect(
      validateRepetitionAndMetaLanguage({ text: exampleAnswer, bannedPhrases: [] }),
    ).toEqual([]);
    expect(
      validateRepetitionAndMetaLanguage({
        text: repeatedInside,
        bannedPhrases: [],
      }).some((error) => error.includes("repeated the same number")),
    ).toBe(true);
  });

  it("limits clarifying questions to three and allows skip", () => {
    const questions = [
      { id: "q1", text: "Who are you meeting?" },
      { id: "q2", text: "What did the recruiter ask you to prepare?" },
      { id: "q3", text: "Why did you leave Contoso Health?" },
      { id: "q4", text: "What else should change the guide?" },
    ];
    expect(limitClarifyingQuestions(questions)).toHaveLength(
      interviewConfig.clarifyingQuestionLimit,
    );
    expect(missingGuideMaterial({
      interviewerCount: 0,
      notesBefore: null,
      priorNotes: [],
      stageType: "RECRUITER_SCREEN",
      rolesMissingLeaveReason: [],
    }).length).toBeGreaterThan(0);
    expect(
      parseClarifyingQuestions({ questions: questions.slice(0, 2) }),
    ).toHaveLength(2);
  });

  it("requires chronological preparation and rejects an invented leave reason", () => {
    const experience = [
      {
        id: "role_2",
        employer: "Contoso Health",
        title: "Software Engineer",
        endDate: "2020-12",
        reasonForLeaving: null,
      },
    ];
    expect(rolesMissingLeaveReason(experience)).toEqual([
      { roleId: "role_2", label: "Software Engineer at Contoso Health" },
    ]);
    const invented: InterviewGuideContent = {
      purpose: claim("p", "This stage decides fit."),
      interviewers: [],
      talkingPoints: [claim("t1", "Use the billing rewrite.")],
      chronologicalWalkthrough: [
        {
          roleId: "role_2",
          employer: "Contoso Health",
          title: "Software Engineer",
          accomplishments: [claim("a1", "Built the member-identity API.")],
          reasonForLeaving: "I wanted a new challenge in robotics.",
          reasonUnknown: false,
        },
      ],
    };
    const inventedErrors = validateInterviewGuideContent({
      content: invented,
      sources: [],
      stageType: "HIRING_MANAGER",
      interviewerIds: [],
      experience,
      priorNoteSourceIds: [],
      approvedStatementIds: [],
      approvedStoryIds: [],
    });
    expect(
      inventedErrors.some((error) => error.toLowerCase().includes("invent")),
    ).toBe(true);

    const unknown: InterviewGuideContent = {
      ...invented,
      chronologicalWalkthrough: [
        {
          roleId: "role_2",
          employer: "Contoso Health",
          title: "Software Engineer",
          accomplishments: [claim("a1", "Built the member-identity API.")],
          reasonForLeaving: "",
          reasonUnknown: true,
        },
      ],
    };
    expect(
      validateInterviewGuideContent({
        content: unknown,
        sources: [],
        stageType: "HIRING_MANAGER",
        interviewerIds: [],
        experience,
        priorNoteSourceIds: [],
        approvedStatementIds: [],
        approvedStoryIds: [],
      }).filter((error) => error.toLowerCase().includes("invent")),
    ).toEqual([]);
  });

  it("rejects first-person narration and allows labeled example answers", () => {
    const narrating: InterviewGuideContent = {
      purpose: claim("p", "I can lead incident response for this stage."),
      interviewers: [],
      talkingPoints: [claim("t1", "Use the billing rewrite.")],
    };
    expect(
      validateInterviewGuideContent({
        content: narrating,
        sources: [],
        stageType: "RECRUITER_SCREEN",
        interviewerIds: [],
        experience: [],
        priorNoteSourceIds: [],
        approvedStatementIds: [],
        approvedStoryIds: [],
      }).some((error) => error.toLowerCase().includes("second person")),
    ).toBe(true);

    const withExample: InterviewGuideContent = {
      purpose: claim("p", "This stage decides whether you can lead incidents."),
      interviewers: [
        {
          contactId: "contact_priya",
          roleId: "persona_recruiter",
          whoTheyAre: claim("w", "Priya screens for production reliability."),
          whatTheyEvaluate: claim("e", "She will evaluate your incident ownership."),
          likelyQuestions: [
            {
              question: claim("q", "Tell me about a production incident you led."),
              answerMaterial: claim(
                "a",
                "Use your invoice rewrite and on-call week.",
              ),
              exampleAnswer: claim(
                "x",
                "I led the rewrite of invoice generation that cut failed billing runs.",
              ),
              statementIds: [],
              storyIds: [],
            },
          ],
          questionsToAsk: [claim("ask", "What does success look like in the first quarter?")],
        },
      ],
      talkingPoints: [claim("t1", "Lead with your invoice rewrite.")],
    };
    expect(
      validateInterviewGuideContent({
        content: withExample,
        sources: [],
        stageType: "RECRUITER_SCREEN",
        interviewerIds: ["contact_priya"],
        experience: [],
        priorNoteSourceIds: [],
        approvedStatementIds: [],
        approvedStoryIds: [],
      }).filter((error) => error.toLowerCase().includes("second person")),
    ).toEqual([]);
  });

  it("requires earlier-stage notes to change the next guide", () => {
    const content: InterviewGuideContent = {
      purpose: claim("p", "This stage decides technical fit."),
      interviewers: [],
      talkingPoints: [claim("t1", "Prepare production stories.")],
    };
    const withoutCite = validateInterviewGuideContent({
      content,
      sources: [
        {
          id: "interview:s1:notesAfter",
          text: "The hiring manager will focus on incident leadership.",
          category: "APPLICATION",
        },
      ],
      stageType: "HIRING_MANAGER",
      interviewerIds: [],
      experience: [],
      priorNoteSourceIds: ["interview:s1:notesAfter"],
      approvedStatementIds: [],
      approvedStoryIds: [],
    });
    expect(withoutCite.some((error) => error.includes("earlier stage"))).toBe(true);

    const withCite: InterviewGuideContent = {
      purpose: claim("p", "This stage decides technical fit."),
      interviewers: [],
      talkingPoints: [
        claim(
          "t1",
          "The hiring manager will focus on incident leadership.",
          "interview:s1:notesAfter",
        ),
      ],
    };
    const messages = buildInterviewGuideMessages({
      stageType: "HIRING_MANAGER",
      format: "VIDEO",
      scheduledAt: "2026-10-01T15:00:00.000Z",
      notesBefore: null,
      notesAfter: null,
      expectedDecisionAt: null,
      interviewers: [],
      priorStageNotes: [
        {
          stageId: "s1",
          type: "RECRUITER_SCREEN",
          notesAfter: "The hiring manager will focus on incident leadership.",
        },
      ],
      clarifyingAnswers: [],
      profileRoles: [],
      approvedStatements: [],
      approvedStories: [],
      scorecardCompetencies: [],
      consultationGaps: [],
      personas: [],
      sources: [],
      qualityFeedback: [],
    });
    expect(messages[1]!.content).toContain("incident leadership");
    expect(
      validateInterviewGuideContent({
        content: withCite,
        sources: [
          {
            id: "interview:s1:notesAfter",
            text: "The hiring manager will focus on incident leadership.",
            category: "APPLICATION",
          },
        ],
        stageType: "RECRUITER_SCREEN",
        interviewerIds: [],
        experience: [],
        priorNoteSourceIds: ["interview:s1:notesAfter"],
        approvedStatementIds: [],
        approvedStoryIds: [],
      }),
    ).toEqual([]);
  });

  it("requires thank-you messages to use notes and never include a redirect", () => {
    const notes = "The hiring manager will focus on incident leadership.";
    expect(
      thankYouNotesErrors({
        text: "Thank you for your time yesterday.",
        notes,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      thankYouNotesErrors({
        text: "I appreciated that the hiring manager will focus on incident leadership. Would a brief follow-up help?",
        notes,
      }),
    ).toEqual([]);
    expect(
      redirectLineErrors({
        text: "If you're not the right person, I'd appreciate a pointer to who is.",
        includeRedirect: false,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("computes thank-you and check-in timing and treats an outcome as cleared", () => {
    const scheduled = new Date("2026-10-01T15:00:00.000Z");
    const thankYou = thankYouDueAt(
      scheduled,
      interviewConfig.reminders.defaultThankYouHours,
    );
    expect(thankYou.toISOString()).toBe("2026-10-02T15:00:00.000Z");
    const withDecision = checkInDueAt({
      expectedDecisionAt: new Date("2026-10-08T00:00:00.000Z"),
      scheduledAt: scheduled,
      businessDays: interviewConfig.reminders.defaultCheckInBusinessDays,
    });
    expect(withDecision.toISOString().startsWith("2026-10-09")).toBe(true);
    const withoutDecision = checkInDueAt({
      expectedDecisionAt: null,
      scheduledAt: scheduled,
      businessDays: interviewConfig.reminders.defaultCheckInBusinessDays,
    });
    expect(withoutDecision.getTime()).toBe(
      addBusinessDays(
        scheduled,
        interviewConfig.reminders.defaultCheckInBusinessDays,
      ).getTime(),
    );
    expect(detectInterviewNoteGap({
      notesAfter: "The hiring manager will focus on incident leadership.",
      assessments: [
        { targetKey: "c1", text: "incident leadership under pressure", strength: "NONE" },
      ],
      scorecardCompetencies: [],
    })?.targetKey).toBe("c1");
  });

  it("keeps a failed guide generate on screen instead of remounting the page", () => {
    const action = readFileSync("src/app/actions/interview.ts", "utf8");
    expect(action).toMatch(
      /if \(result\.status === "FAILED"\) \{[\s\S]*revalidate\(id, stageId\)/,
    );
  });

  it("prints the guide without navigation or controls", () => {
    const page = readFileSync(
      "src/app/(app)/campaigns/[id]/interviews/[stageId]/page.tsx",
      "utf8",
    );
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(page).toContain('className="application-summary');
    expect(page).toContain("print:hidden");
    expect(css).toContain(".application-summary button");
    expect(css).toContain("nav,");
  });
});

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("interview stages persistence", () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let recruiterRoleId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { createIndividualWorkspace } = await import("@/lib/org/signup");
    prisma = new PrismaClient();
    const workspace = await createIndividualWorkspace({
      email: `interview-${suffix}@example.test`,
      name: "Interview Seeker",
    });
    organizationId = workspace.organization.id;
    userId = workspace.user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Profile ${suffix}`,
        approvalStatus: "APPROVED",
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Interview ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    const recruiter = await prisma.persona.create({
      data: {
        organizationId,
        productId: product.id,
        campaignId,
        suggestionKey: "recruiter",
        name: "Recruiter",
        targetTitles: ["Recruiter", "Technical Recruiter"],
      },
    });
    recruiterRoleId = recruiter.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Senior Product Engineer\nAcme Robotics",
        title: "Senior Product Engineer",
        companyName: "Acme Robotics",
        scorecardJson: { mission: null, outcomes: [], competencies: [] },
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization
        .delete({ where: { id: organizationId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("sets Interviewing on first stage and confirms interviewer roles", async () => {
    const stage = await createInterviewStage({
      organizationId,
      campaignId,
      userId,
      type: "RECRUITER_SCREEN",
      scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
      format: "VIDEO",
    });
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });
    expect(campaign?.applicationProgress).toBe("INTERVIEWING");
    const added = await addInterviewStageInterviewer({
      organizationId,
      campaignId,
      userId,
      stageId: stage.id,
      firstName: "Priya",
      lastName: "Shah",
      title: "Technical Recruiter",
      email: `priya-int-${suffix}@acme.example`,
    });
    expect(added.personaId).toBe(recruiterRoleId);
    const membership = await prisma.campaignContact.findFirst({
      where: { campaignId, contactId: added.contactId },
    });
    expect(membership?.roleConfirmed).toBe(true);
    await updateInterviewStage({
      organizationId,
      campaignId,
      userId,
      stageId: stage.id,
      outcome: "ADVANCED",
    });
    const updated = await prisma.interviewStage.findUnique({
      where: { id: stage.id },
    });
    expect(updated?.outcome).toBe("ADVANCED");
  });
});
