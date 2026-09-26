import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDatabase } from "@/test/database";
import { fixtureAlexChenProfile } from "@/lib/product-research/fixtures/alex-chen-profile";

const polishAnswerWithQuality = vi.hoisted(() => vi.fn());

vi.mock("@/lib/consultation/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/consultation/service")>();
  return {
    ...actual,
    polishAnswerWithQuality,
  };
});

import {
  assignCoachItemIds,
  coachItemIsComplete,
  collectCoachItems,
  prepareInstructionViolations,
  replaceCoachItem,
  seekerThirdPersonViolations,
} from "@/lib/application-summary/coach";
import { applicationSummaryGuidanceSchema } from "@/lib/application-summary/contract";
import { answerCheatSheetCoachItem } from "@/lib/application-summary/service";
import {
  applicationSummaryConfig,
  consultationConfig,
  consultationConversationCopy,
} from "@/lib/product-config";

const support = [{ sourceId: "story:1", quote: "I rebuilt the forecast cadence." }];

function coachGuidance() {
  return assignCoachItemIds(
    applicationSummaryGuidanceSchema.parse({
      overview: {
        thirtySecondFit: { text: "I fit this role because I rebuilt forecast cadence.", supports: support },
        careerRecap: { text: "I have led enterprise sales teams.", supports: support },
        gapsToPrepare: [
          {
            prompt: "Local enterprise motion",
            sampleAnswer: "I have not run this motion here yet, so I would start with two customer visits.",
            harperQuestion: null,
            supports: support,
          },
        ],
      },
      stories: [
        {
          storyId: "story-1",
          headline: "Forecast cadence",
          situation: "I rebuilt the forecast cadence.",
          answers: [
            { requirement: "Forecast discipline", question: "How do you run forecast?" },
          ],
          variations: [
            {
              angle: "Forecast discipline",
              text: "I held managers to a weekly commit against pipeline quality.",
              supports: support,
            },
          ],
        },
      ],
      people: [
        {
          sectionKey: "role:hm",
          roleId: "role-hm",
          contactId: null,
          heading: "Hiring Manager",
          sectionKind: "HIRING_MANAGER",
          caresAbout: [{ text: "Repeatable enterprise execution.", supports: support }],
          bestMaterial: [{ text: "I rebuilt the forecast cadence.", supports: support }],
          likelyQuestions: [
            {
              prompt: "How do you run a weekly forecast?",
              sampleAnswer: "I run a Monday commit against pipeline quality and name slip risk out loud.",
              harperQuestion: null,
              supports: support,
            },
            {
              prompt: "Which KPIs moved after you changed the cadence?",
              sampleAnswer: "I moved forecast accuracy from late-week scramble to a Monday commit.",
              harperQuestion: null,
              supports: support,
            },
            {
              prompt: "How did you use MEDDPICC in the motion?",
              sampleAnswer: "I used MEDDPICC as the inspection checklist on every deal over 50k.",
              harperQuestion: null,
              supports: support,
            },
          ],
          questionsToAsk: [
            { text: "What does a good first 90 days look like?", supports: support },
          ],
          storyIds: ["story-1"],
          recruiter: null,
          hiringManager: {
            scorecardOutcomes: [
              { outcome: "Repeatable motion", storyId: "story-1", note: "I rebuilt the cadence." },
            ],
            firstNinetyDays: {
              text: "I would spend the first two weeks in the forecast and on customer calls.",
              supports: support,
            },
            drillDowns: [
              {
                prompt: "Walk me through one deal you inspected.",
                sampleAnswer: "I sat in on a late-stage deal, asked for the economic buyer, and the commit slipped.",
                harperQuestion: null,
                supports: support,
              },
            ],
            gaps: [
              {
                prompt: "Front-line manager development",
                sampleAnswer: null,
                harperQuestion:
                  "Have you developed a front-line manager? Tell me what wasn't working and what changed?",
                supports: support,
              },
            ],
          },
          executive: null,
          crossFunctional: null,
        },
      ],
    }),
  );
}

describe("Interview cheat sheet coach", () => {
  it("gives every likely question, drill-down, and flag a sample answer or Harper question with a reply box", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const widget = readFileSync("src/components/CheatSheetCoachItems.tsx", "utf8");
    const prompt = readFileSync("src/lib/prompt-content/application-summary.ts", "utf8");
    expect(page).toContain("CheatSheetCoachItems");
    expect(page).toContain("section.likelyQuestions");
    expect(page).toContain("section.hiringManager.drillDowns");
    expect(page).toContain("section.hiringManager.gaps");
    expect(page).toContain("section.recruiter.flagAnswers");
    expect(widget).toContain("sampleAnswer");
    expect(widget).toContain("harperQuestion");
    expect(widget).toContain("name=\"answer\"");
    expect(widget).toContain("answerCheatSheetCoachAction");
    expect(widget).toContain("consultationConversationCopy.threadReply");
    expect(prompt).toContain("sampleAnswer");
    expect(prompt).toContain("harperQuestion");
    expect(prompt).toContain("first person");
    const items = collectCoachItems(coachGuidance());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(coachItemIsComplete)).toBe(true);
    expect(items.some((item) => item.sampleAnswer)).toBe(true);
    expect(items.some((item) => item.harperQuestion)).toBe(true);
  });

  it("rejects prepare-style instructions and third-person seeker copy", () => {
    expect(prepareInstructionViolations("Be ready to explain exactly which KPIs you changed.")).not.toEqual([]);
    expect(prepareInstructionViolations("Prepare a clear answer on how MEDDPICC was used.")).not.toEqual([]);
    expect(prepareInstructionViolations("Expect questions on forecast discipline.")).not.toEqual([]);
    expect(
      prepareInstructionViolations("I moved forecast accuracy by inspecting commits every Monday."),
    ).toEqual([]);
    expect(
      seekerThirdPersonViolations({
        text: "Erik brings a repeatable enterprise motion.",
        firstName: "Erik",
      }),
    ).not.toEqual([]);
    expect(
      seekerThirdPersonViolations({
        text: "I lead a repeatable enterprise motion.",
        firstName: "Erik",
      }),
    ).toEqual([]);
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const prompt = readFileSync("src/lib/prompt-content/application-summary.ts", "utf8");
    const labels = JSON.stringify(applicationSummaryConfig);
    expect(page.toLowerCase()).not.toMatch(/be ready to|expect questions/);
    expect(prompt.toLowerCase()).toContain("never tell the seeker to go prepare");
    expect(labels.toLowerCase()).not.toMatch(/be ready to|expect questions/);
    expect(applicationSummaryConfig.sections.gapsToPrepare).toBe("Gaps to address");
    expect(applicationSummaryConfig.sections.sampleAnswer).toBe("Sample answer");
    expect(applicationSummaryConfig.sections.harperQuestion).toContain(
      consultationConfig.displayName,
    );
  });
});

describe.skipIf(!hasTestDatabase())("cheat sheet Harper reply persistence", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let productId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const organization = await prisma.organization.create({
      data: { name: `[TEST] Cheat sheet coach ${suffix}`, slug: `csc-coach-${suffix}` },
    });
    organizationId = organization.id;
    const user = await prisma.user.create({
      data: {
        email: `csc-coach-${suffix}@example.test`,
        emailNormalized: `csc-coach-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        organizationId,
        name: `Candidate ${suffix}`,
        profileJson: fixtureAlexChenProfile(),
      },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: {
        organizationId,
        productId: product.id,
        name: `Target employer ${suffix}`,
        targetAnnualEarningsTarget: 180000,
        compensationCurrency: "USD",
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        productId: product.id,
        icpId: icp.id,
        name: `CSC ${suffix}`,
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `CSC ${suffix}`,
        normalizedName: `csc-${suffix}`,
      },
    });
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText: "Senior Director of Sales. Build a repeatable enterprise motion.",
        title: "Senior Director of Sales",
        requiredItems: ["Build a repeatable enterprise motion"],
        preferredItems: [],
        responsibilities: ["Lead enterprise sales"],
        scorecardJson: {
          mission: {
            id: "mission:sales",
            text: "Build a repeatable enterprise motion",
            inferred: false,
          },
          outcomes: [],
          competencies: [],
        },
      },
    });
    await prisma.applicationSummary.create({
      data: {
        organizationId,
        campaignId,
        status: "READY",
        promptVersion: "6",
        guidanceJson: coachGuidance(),
      },
    });
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("writes a sample answer from the reply and saves it to the Personal Profile and story bank", async () => {
    const sample =
      "I developed a front-line manager who skipped deal inspection. I sat in on two forecast calls, named the gaps, and that manager hit commit the next quarter.";
    polishAnswerWithQuality.mockResolvedValue({
      ok: true,
      data: {
        interviewAnswer: { text: sample, claims: [] },
        resumeBullet: {
          text: "Coached a front-line manager to inspect deals before forecast.",
          claims: [],
        },
        strengtheningNote: null,
      },
    });
    const item = collectCoachItems(coachGuidance()).find((row) => row.harperQuestion);
    expect(item?.id).toBeTruthy();
    await answerCheatSheetCoachItem({
      organizationId,
      campaignId,
      userId,
      itemId: item!.id!,
      answer:
        "I had a manager who was not inspecting deals. I sat in on two calls, showed him what good looked like, and his commit started landing.",
    });
    const summary = await prisma.applicationSummary.findUnique({
      where: { campaignId },
    });
    const next = applicationSummaryGuidanceSchema.parse(summary?.guidanceJson);
    const updated = collectCoachItems(next).find((row) => row.id === item!.id);
    expect(updated?.sampleAnswer).toBe(sample);
    expect(updated?.harperQuestion).toBeNull();
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(JSON.stringify(product?.profileJson)).toContain("I had a manager who was not inspecting deals");
    const story = await prisma.profileStory.findFirst({
      where: { organizationId, productId },
      orderBy: { createdAt: "desc" },
    });
    expect(story?.verbatimAnswer).toContain("I had a manager who was not inspecting deals");
    expect(story?.interviewAnswer).toBe(sample);
    expect(story?.interviewAnswerApprovedAt).not.toBeNull();
    expect(replaceCoachItem(next, item!.id!, updated!).people[0]?.hiringManager?.gaps[0]?.sampleAnswer).toBe(
      sample,
    );
    expect(consultationConversationCopy.threadReply).toBe("Reply");
  });
});
