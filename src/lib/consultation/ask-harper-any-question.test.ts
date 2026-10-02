// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ConsultationPage from "@/app/(app)/campaigns/[id]/consultation/page";
import InterviewsPage from "@/app/(app)/campaigns/[id]/interviews/page";
import SummaryPage from "@/app/(app)/campaigns/[id]/summary/page";
import { askHarperAction } from "@/app/actions/ask-harper";
import { ConsultationSection } from "@/components/ConsultationSection";
import { askHarper } from "@/lib/consultation/ask-harper";
import {
  askHarperAnswerKind,
  composedPointOfViewAnswer,
  isRealAskHarperQuestion,
} from "@/lib/consultation/ask-harper-answer";
import {
  composedAnswerFromRoleExpertiseQuestion,
  validateRoleExpertiseQuestions,
} from "@/lib/consultation/role-expertise";
import { resultStatesOutcome } from "@/lib/consultation/polish-parts";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  consultationConversationCopy,
  consultationStatementLabels,
} from "@/lib/product-config";
import {
  PROFILE_SCHEMA_VERSION,
  candidateProfileSchema,
} from "@/lib/product-research/candidate-profile";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";
import * as jobs from "@/lib/application-jobs/service";

const FACT = "Closed 14 deals at Northwind";
const PRODUCTION =
  "What are the key attributes of top performing sales rep on your team?";
const OPINION = "What do you look for in a top performing sales rep?";
const APPROACH = "How do you think about a late-stage negotiation?";
const KNOWLEDGE = "What's your philosophy on discounting to win a deal?";
const STORY = "How did you keep the Northwind renewal when the buyer wanted to leave?";
const FAILED = "What should I say when the hiring manager asks about a gap?";

for (const [key, value] of [
  ["CONSULTATION_REPLY_AI_PROVIDER", "openai-responses"],
  ["CONSULTATION_REPLY_AI_MODEL", "gpt-5.6-luna"],
  ["CONSULTATION_REPLY_AI_MODEL_URL", "https://example.test/v1"],
  ["CONSULTATION_REPLY_AI_API_KEY", "test-key"],
] as const) {
  if (!process.env[key]?.trim()) process.env[key] = value;
}

const session = vi.hoisted(() => ({ userId: "", organizationId: "" }));
const replyGenerate = vi.hoisted(() => vi.fn());
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/consultation",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) =>
    createElement("a", { ...props, href }, children),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: async () => ({ id: session.userId }),
  getCurrentUser: async () => ({ id: session.userId }),
}));
vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  getCurrentOrganization: async () =>
    session.organizationId ? { id: session.organizationId } : null,
  requireOrganizationId: async () => session.organizationId,
}));
vi.mock("@/lib/auth/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/authz")>();
  return {
    ...actual,
    getMembershipForCurrentUser: async () => ({
      membership: { role: "OWNER" },
      user: { id: session.userId },
    }),
    requireCurrentUser: async () => ({ id: session.userId }),
  };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    getConsultationReplyAiProvider: () => ({ generateStructured: replyGenerate }),
  };
});

const enqueue = vi.spyOn(jobs, "enqueueApplicationJob");

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function modelAnswer(text: string) {
  const base = {
    text,
    answerFramework: "CAR" as const,
    challenge: null as string | null,
    situation: null,
    task: null,
    action: "",
    result: "",
  };
  if (text === PRODUCTION) {
    return {
      ...base,
      challenge: "Top performers are clear with the buyer.",
      action: "I look for people who keep their word with the customer.",
      result: "Better.",
    };
  }
  if (text === OPINION) {
    return { ...base, action: "I look for reps who prepare before the call.", result: "" };
  }
  if (text === APPROACH) {
    return {
      ...base,
      action: "I think about the buyer's next step before I talk about price.",
      result: "Ok.",
    };
  }
  if (text === KNOWLEDGE) {
    return {
      ...base,
      action: "My philosophy is to tell the buyer the truth about the fit.",
      result: "",
    };
  }
  if (text === STORY) {
    return {
      ...base,
      challenge: "The buyer wanted to leave.",
      action: `I kept the record of ${FACT}.`,
      result: "The renewal stayed in place after that.",
    };
  }
  return base;
}

describe("Ask Harper question shape", () => {
  it("rejects the production answer at the outcome check and classifies it as a point of view", () => {
    const answer = modelAnswer(PRODUCTION);
    expect(askHarperAnswerKind(PRODUCTION)).toBe("point-of-view");
    expect(askHarperAnswerKind(OPINION)).toBe("point-of-view");
    expect(askHarperAnswerKind(APPROACH)).toBe("point-of-view");
    expect(askHarperAnswerKind(KNOWLEDGE)).toBe("point-of-view");
    expect(askHarperAnswerKind(STORY)).toBe("story");
    expect(resultStatesOutcome(answer.result)).toBe(false);
    expect(
      composedAnswerFromRoleExpertiseQuestion({
        ...answer,
        interviewTypeTag: "focused_competency",
      }),
    ).toBeNull();
    const rejected = validateRoleExpertiseQuestions({
      questions: [{ ...answer, interviewTypeTag: "focused_competency" }],
      minCount: 1,
      maxCount: 1,
      askedQuestions: [],
      chronologyAlreadyAsked: false,
    });
    expect(rejected.valid).toHaveLength(0);
    expect(rejected.issues.join(" ")).toContain("result that states an outcome");
    expect(composedPointOfViewAnswer(answer)?.content).toContain(
      "keep their word with the customer",
    );
    expect(composedPointOfViewAnswer(answer)?.content).not.toContain("Better.");
    const story = modelAnswer(STORY);
    expect(
      validateRoleExpertiseQuestions({
        questions: [{ ...story, result: "Better.", interviewTypeTag: "focused_competency" }],
        minCount: 1,
        maxCount: 1,
        askedQuestions: [],
        chronologyAlreadyAsked: false,
      }).valid,
    ).toHaveLength(0);
    expect(
      validateRoleExpertiseQuestions({
        questions: [{ ...story, interviewTypeTag: "focused_competency" }],
        minCount: 1,
        maxCount: 1,
        askedQuestions: [],
        chronologyAlreadyAsked: false,
      }).valid[0]?.content,
    ).toContain("The renewal stayed in place after that.");
  });

  it("treats empty and meaningless input as not a question", async () => {
    expect(isRealAskHarperQuestion("")).toBe(false);
    expect(isRealAskHarperQuestion("hello")).toBe(false);
    expect(isRealAskHarperQuestion("???")).toBe(false);
    replyGenerate.mockClear();
    for (const question of ["", "hello", "???"]) {
      const result = await askHarper({
        organizationId: "unused",
        campaignId: "unused",
        question,
      });
      expect(result).toEqual({
        ok: false,
        message: consultationConversationCopy.askHarperNotAQuestion,
      });
    }
    expect(replyGenerate).not.toHaveBeenCalled();
    expect(consultationConversationCopy.askHarperNotAQuestion).toBe(
      "That isn't an interview question. Ask a real one.",
    );
  });
});

describe("Ask Harper answers every real question", () => {
  const suffix = `ask-harper-any-${Date.now()}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let root: Root;
  let host: HTMLDivElement;

  beforeAll(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    replyGenerate.mockImplementation(async (request: { messages?: Array<{ content?: string }> }) => {
      const user = [...(request.messages ?? [])]
        .reverse()
        .find((message) => message.content?.includes("\"questions\""))?.content;
      const parsed = JSON.parse(user ?? "{}") as { questions?: Array<{ text?: string }> };
      const text = parsed.questions?.[0]?.text ?? "";
      return { data: { answers: [modelAnswer(text)] } };
    });
    if (!hasTestDatabase()) return;
    const org = await prisma.organization.create({
      data: { name: `[TEST] Ask Harper any ${suffix}`, slug: `ask-harper-any-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `ask-harper-any-${suffix}@example.test`,
        emailNormalized: `ask-harper-any-${suffix}@example.test`,
      },
    });
    userId = user.id;
    session.userId = userId;
    session.organizationId = organizationId;
    const profile = candidateProfileSchema.parse({
      schemaVersion: PROFILE_SCHEMA_VERSION,
      identity: {
        headline: {
          id: "headline-1",
          kind: "FACT",
          text: FACT,
          provenance: [{ sourceId: "resume" }],
        },
      },
      direction: {},
    });
    const product = await prisma.product.create({
      data: { organizationId, name: `Ask Harper any ${suffix}`, profileJson: profile },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Ask Harper any ${suffix}`,
        productId: product.id,
        icpId: icp.id,
        applicationProgress: "APPLIED",
      },
    });
    campaignId = campaign.id;
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: `Northwind ${suffix}`,
        normalizedName: `northwind-any-${suffix}`,
      },
    });
    const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        companyId: company.id,
        rawText: NORMAL_JOB_POSTING,
        title: parsed.title,
        companyName: parsed.companyName,
        requiredItems: parsed.requiredItems,
        preferredItems: parsed.preferredItems,
        responsibilities: parsed.responsibilities,
        scorecardJson: parsed.scorecard,
        employerDisposition: "IDENTIFIED",
        identityConfirmation: "CONFIRMED",
      },
    });
  }, 60_000);

  afterAll(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("drafts a point of view for the production question and keeps story checks", async () => {
    if (!hasTestDatabase()) return;
    replyGenerate.mockClear();
    enqueue.mockClear();
    await ConsultationPage({ params: Promise.resolve({ id: campaignId }) });
    await InterviewsPage({ params: Promise.resolve({ id: campaignId }) });
    await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    expect(replyGenerate).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    const asked = await askHarperAction(null, formData({ campaignId, question: PRODUCTION }));
    expect(asked).toEqual({
      ok: true,
      message: consultationConversationCopy.askHarperDrafted,
    });
    expect(asked.message).not.toBe(consultationConversationCopy.askHarperFailed);
    expect(replyGenerate).toHaveBeenCalledTimes(1);
    const beforeRepeat = replyGenerate.mock.calls.length;
    const repeat = await askHarperAction(null, formData({ campaignId, question: PRODUCTION }));
    expect(repeat.ok).toBe(true);
    expect(replyGenerate).toHaveBeenCalledTimes(beforeRepeat);

    const harper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await act(async () => {
      root.render(harper);
    });
    const draft = host.querySelector("[data-testid=ask-harper-drafts]");
    expect(draft?.textContent).toContain("keep their word with the customer");
    expect(draft?.textContent).not.toContain("Better.");
    expect(draft?.textContent).toContain(consultationStatementLabels.DRAFT);
    expect(draft?.textContent).toContain(consultationConversationCopy.approve);
    expect(draft?.textContent).toContain(consultationConversationCopy.threadReply);
    expect(draft?.textContent).not.toContain(consultationConversationCopy.askHarperFailed);

    for (const [question, view] of [
      [OPINION, "prepare before the call"],
      [APPROACH, "buyer's next step"],
      [KNOWLEDGE, "truth about the fit"],
    ] as const) {
      const result = await askHarperAction(null, formData({ campaignId, question }));
      expect(result.ok).toBe(true);
      const turn = await prisma.consultationTurn.findFirstOrThrow({
        where: { organizationId, body: question },
        include: { statements: true },
      });
      expect(turn.statements[0]?.content).toContain(view);
      expect(turn.statements[0]?.content).not.toContain("Ok.");
      expect(turn.statements[0]?.status).toBe("DRAFT");
    }

    const story = await askHarperAction(null, formData({ campaignId, question: STORY }));
    expect(story.ok).toBe(true);
    const storyTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: STORY },
      include: { statements: true },
    });
    expect(storyTurn.statements[0]?.content).toContain(FACT);
    expect(storyTurn.statements[0]?.content).toContain("The renewal stayed in place after that.");

    const callsBeforeFail = replyGenerate.mock.calls.length;
    const failed = await askHarperAction(null, formData({ campaignId, question: FAILED }));
    expect(failed.ok).toBe(true);
    expect(failed.message).not.toBe(consultationConversationCopy.askHarperFailed);
    expect(replyGenerate.mock.calls.length - callsBeforeFail).toBe(3);
    const failedTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: FAILED },
      include: { statements: true },
    });
    expect(failedTurn.statements[0]?.content).toBe(`${FACT}.`);
    expect(failedTurn.statements[0]?.content).not.toContain("Globex");
    const callsAfterFail = replyGenerate.mock.calls.length;
    const failedAgain = await askHarperAction(null, formData({ campaignId, question: FAILED }));
    expect(failedAgain.ok).toBe(true);
    expect(replyGenerate).toHaveBeenCalledTimes(callsAfterFail);

    const empty = await askHarperAction(null, formData({ campaignId, question: "hello" }));
    expect(empty).toEqual({
      ok: false,
      message: "That isn't an interview question. Ask a real one.",
    });
    expect(replyGenerate).toHaveBeenCalledTimes(callsAfterFail);
    expect(enqueue).not.toHaveBeenCalled();
  }, 60_000);
});
