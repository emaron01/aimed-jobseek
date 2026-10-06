// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ConsultationPage from "@/app/(app)/campaigns/[id]/consultation/page";
import InterviewsPage from "@/app/(app)/campaigns/[id]/interviews/page";
import SummaryPage from "@/app/(app)/campaigns/[id]/summary/page";
import { askHarperAction } from "@/app/actions/ask-harper";
import { replyConsultationAction } from "@/app/actions/consultation";
import { ConsultationSection } from "@/components/ConsultationSection";
import { askHarper } from "@/lib/consultation/ask-harper";
import {
  ASK_HARPER_PLACEHOLDER_ANSWER,
  askHarperAnswerCloseness,
  askHarperAnswerKind,
  askHarperAttemptProse,
  askHarperUnpassedDraft,
  chooseAskHarperFallbackAnswer,
  composedPointOfViewAnswer,
  isRealAskHarperQuestion,
} from "@/lib/consultation/ask-harper-answer";
import { continueConsultationPlanning } from "@/lib/consultation/service";
import {
  composedAnswerFromRoleExpertiseQuestion,
  ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION,
  ROLE_EXPERTISE_PROMPT_VERSION,
  roleExpertiseJobFingerprint,
  storeRoleExpertiseQuestions,
  validateRoleExpertiseQuestions,
} from "@/lib/consultation/role-expertise";
import { ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/role-expertise";
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
const UNCOVERED = "How do you think about building a territory from zero?";
const SAMPLE =
  "I would learn the buyer's decision process before I talk about price.";
const FOLLOW_UP = "Which account would you use as your own example?";
const APPROVED_ANSWERS_PARAGRAPH =
  "Suggested answers: for each question, write the answer this person could give, drawn from their Personal Profile and fitting careerStage (for new_to_workforce or college_graduate, school, internships, projects, part-time work, and activities; for early_career through late_career, roles and results at the level of this job). When the profile has little on a question, still write the strongest suggested answer you can, as a starting point the person will make their own. Keep every number, fraction, percentage, date, company, and name exactly as the person stated it. Never name the framework or label a part in any field. When the question asks for an opinion, an approach, a philosophy, or what the person looks for or knows, answer in the seeker's point of view and support it with an example from the Personal Profile or a prior approved answer when one exists. Do not invent a story result or outcome for that kind of question. For a story question, return answerFramework plus its parts, CAR (challenge, action, result) by default or STAR (situation, task, action, result) when setup matters, in natural first-person speech so the parts read as one answer when joined in order. The result states what changed because of the person's action; a number is welcome but never required. When the person's information doesn't cover the question, write a strong sample answer from your own expertise on the topic, framed as the person's point of view. Never invent personal experience, employers, numbers, or results. Then ask one follow-up question that would let the person add their own example.";

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

  it("uses the approved answers paragraph and does not re-run stored suggested answers from that bump", () => {
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(
      APPROVED_ANSWERS_PARAGRAPH,
    );
    expect(ROLE_EXPERTISE_ANSWERS_SYSTEM_INSTRUCTIONS).toContain(
      "Combine as many approved answers and profile facts as the question needs. Keep every employer, number, title, and outcome exactly as stated; a result achieved at one company stays at that company. Use this company and role only to frame why the experience matters here.",
    );
    expect(ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION).toBe("8");
    expect(ROLE_EXPERTISE_PROMPT_VERSION).toBe("3");
    const roleExpertise = readFileSync("src/lib/consultation/role-expertise.ts", "utf8");
    const jobFn = roleExpertise.slice(
      roleExpertise.indexOf("export function roleExpertiseJobFingerprint"),
      roleExpertise.indexOf("export function roleExpertiseAnswersFingerprint"),
    );
    expect(jobFn).toContain("ROLE_EXPERTISE_PROMPT_VERSION");
    expect(jobFn).not.toContain("ROLE_EXPERTISE_ANSWERS_PROMPT_VERSION");
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const fill = service.slice(
      service.indexOf("async function maybeFillRoleExpertiseAfterGapPlan"),
      service.indexOf("async function finishIfPlanningIsComplete"),
    );
    const skip = fill.indexOf("if (usable && existingRoleExpertise >= minCount) return;");
    const generate = fill.indexOf("generateRoleExpertiseWithModel");
    expect(skip).toBeGreaterThan(-1);
    expect(generate).toBeGreaterThan(skip);
    const job = {
      title: "Sales Director",
      companyName: "Contoso",
      seniority: null,
      location: null,
      workArrangement: null,
      requiredItems: [],
      preferredItems: [],
      responsibilities: [],
      scorecardJson: {},
    };
    expect(roleExpertiseJobFingerprint(job)).toBe(roleExpertiseJobFingerprint(job));
  });

  it("picks the closest failed attempt and drops invented claims and profile-fact placeholders", () => {
    const invented = {
      answerFramework: "CAR" as const,
      challenge: null,
      situation: null,
      task: null,
      action: "Result: At Globex I closed 40 deals and revenue rose 12%.",
      result: "",
    };
    const closest = {
      answerFramework: "CAR" as const,
      challenge: null,
      situation: null,
      task: null,
      action: "I value preparation.",
      result: "",
    };
    const empty = {
      answerFramework: "CAR" as const,
      challenge: null,
      situation: null,
      task: null,
      action: "",
      result: ASK_HARPER_PLACEHOLDER_ANSWER,
    };
    expect(askHarperAnswerCloseness(closest, "point-of-view")).toBeGreaterThan(
      askHarperAnswerCloseness(invented, "point-of-view"),
    );
    const chosen = chooseAskHarperFallbackAnswer({
      attempts: [invented, closest, empty],
      kind: "point-of-view",
      sourceTexts: [FACT],
    });
    expect(chosen?.content).toBe("I value preparation.");
    expect(chosen?.content).not.toContain("Globex");
    expect(chosen?.content).not.toContain(FACT);
    expect(chosen?.content).not.toBe(ASK_HARPER_PLACEHOLDER_ANSWER);
    expect(
      askHarperUnpassedDraft({
        answer: { ...closest, action: FACT },
        kind: "point-of-view",
        sourceTexts: [FACT],
      }),
    ).toBe("");
  });

  it("keeps general expertise and grounded first-person claims, and drops unsupported personal claims", () => {
    const draft = askHarperUnpassedDraft({
      answer: {
        answerFramework: "CAR",
        challenge: null,
        situation: null,
        task: null,
        action:
          "I grew revenue 40% at Acme. Top reps keep 3x pipeline coverage. MEDDPICC helps qualify deals. I closed 14 deals at Northwind.",
        result: ASK_HARPER_PLACEHOLDER_ANSWER,
      },
      kind: "point-of-view",
      sourceTexts: [FACT],
    });
    expect(draft).not.toContain("I grew revenue 40% at Acme.");
    expect(draft).not.toContain("40%");
    expect(draft).not.toContain("Acme");
    expect(draft).toContain("Top reps keep 3x pipeline coverage.");
    expect(draft).toContain("MEDDPICC helps qualify deals.");
    expect(draft).toContain("I closed 14 deals at Northwind.");
    expect(draft).not.toContain(ASK_HARPER_PLACEHOLDER_ANSWER);
    expect(draft).not.toBe(`${FACT}.`);
  });

  it("keeps usable drafts for the CSC point-of-view and story questions the strict checks drop", () => {
    const attract = "What attracts you to CSC's Senior Director of Sales role?";
    const pipeline = "Describe a time when you inherited an unhealthy pipeline?";
    const indicators =
      "Which leading and lagging indicators would you use to inspect the forecast?";
    expect(askHarperAnswerKind(attract)).toBe("point-of-view");
    expect(askHarperAnswerKind(pipeline)).toBe("story");
    expect(askHarperAnswerKind(indicators)).toBe("point-of-view");

    const sources = ["CSC", "Senior Director of Sales"];
    const attractDraft = askHarperUnpassedDraft({
      answer: {
        answerFramework: "CAR",
        challenge: null,
        situation: null,
        task: null,
        action: "",
        result:
          "I am drawn to CSC's Senior Director of Sales role because it owns forecast discipline and manager standards.",
      },
      kind: "point-of-view",
      sourceTexts: sources,
    });
    expect(attractDraft).toContain("forecast discipline");

    const pipelineDraft = askHarperUnpassedDraft({
      answer: {
        answerFramework: "CAR",
        challenge: null,
        situation: null,
        task: null,
        action: "",
        result:
          "I inherited an unhealthy pipeline and reset inspection so the forecast became reliable.",
      },
      kind: "story",
      sourceTexts: sources,
    });
    expect(pipelineDraft).toContain("unhealthy pipeline");
    expect(pipelineDraft).toContain("forecast became reliable");

    const indicatorDraft = askHarperUnpassedDraft({
      answer: {
        answerFramework: "CAR",
        challenge: null,
        situation: null,
        task: null,
        action:
          "Leading indicators I would use are activity and pipeline creation, and lagging indicators are win rate and cycle time.",
        result: "",
      },
      kind: "point-of-view",
      sourceTexts: sources,
    });
    expect(indicatorDraft).toContain("Leading indicators");
    expect(indicatorDraft).toContain("lagging indicators");
  });

  it("stores the closest attempt when claim-stripping leaves only a profile fact", () => {
    const factOnly = {
      answerFramework: "CAR" as const,
      challenge: null,
      situation: null,
      task: null,
      action: FACT,
      result: "",
    };
    expect(
      askHarperUnpassedDraft({
        answer: factOnly,
        kind: "point-of-view",
        sourceTexts: [FACT],
      }),
    ).toBe("");
    const chosen = chooseAskHarperFallbackAnswer({
      attempts: [factOnly],
      kind: "point-of-view",
      sourceTexts: [FACT],
    });
    expect(chosen?.content).toBe(askHarperAttemptProse(factOnly));
    expect(chosen?.content).toContain("Closed 14 deals at Northwind");
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
    const failedAttempt = { n: 0 };
    replyGenerate.mockImplementation(async (request: { messages?: Array<{ content?: string }> }) => {
      const user = [...(request.messages ?? [])]
        .reverse()
        .find((message) => message.content?.includes("\"questions\""))?.content;
      const parsed = JSON.parse(user ?? "{}") as { questions?: Array<{ text?: string }> };
      const text = parsed.questions?.[0]?.text ?? "";
      if (text === UNCOVERED) {
        return {
          data: {
            answers: [
              {
                text,
                answerFramework: "CAR" as const,
                challenge: null,
                situation: null,
                task: null,
                action: SAMPLE,
                result: "",
                followUpQuestion: FOLLOW_UP,
              },
            ],
          },
        };
      }
      if (text === FAILED) {
        failedAttempt.n += 1;
        const turn = ((failedAttempt.n - 1) % 3) + 1;
        const base = {
          text,
          answerFramework: "CAR" as const,
          challenge: null,
          situation: null,
          task: null,
          action: "",
          result: "",
          followUpQuestion: null as string | null,
        };
        if (turn === 1) {
          return {
            data: {
              answers: [
                {
                  ...base,
                  action: "Result: At Globex I closed 40 deals and revenue rose 12%.",
                },
              ],
            },
          };
        }
        if (turn === 2) {
          return {
            data: {
              answers: [{ ...base, action: "I value preparation.", followUpQuestion: FOLLOW_UP }],
            },
          };
        }
        return { data: { answers: [base] } };
      }
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
    expect(failedTurn.statements[0]?.content).toBe("I value preparation.");
    expect(failedTurn.statements[0]?.content).not.toBe(`${FACT}.`);
    expect(failedTurn.statements[0]?.content).not.toContain("Globex");
    expect(failedTurn.statements[0]?.content).not.toContain(ASK_HARPER_PLACEHOLDER_ANSWER);
    expect(failedTurn.statements[0]?.status).toBe("DRAFT");
    const callsBeforeRender = replyGenerate.mock.calls.length;
    const failedHarper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await act(async () => {
      root.render(failedHarper);
    });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforeRender);
    const failedCard = [...host.querySelectorAll("article")].find((card) =>
      card.textContent?.includes(FAILED),
    );
    expect(failedCard?.textContent).toContain("I value preparation.");
    expect(failedCard?.textContent).toContain(consultationStatementLabels.DRAFT);
    expect(failedCard?.textContent).toContain(consultationConversationCopy.approve);
    expect(failedCard?.textContent).toContain(consultationConversationCopy.threadReply);
    expect(failedCard?.textContent).not.toContain("Globex");
    expect(failedCard?.textContent).not.toContain(FACT);
    expect(failedCard?.textContent).not.toContain(ASK_HARPER_PLACEHOLDER_ANSWER);
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

  it("shows one follow-up on an uncovered question and does not re-run stored answers", async () => {
    if (!hasTestDatabase()) return;
    const callsBeforePlanning = replyGenerate.mock.calls.length;
    await continueConsultationPlanning({ organizationId, campaignId });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforePlanning);
    expect(enqueue).not.toHaveBeenCalled();

    const callsBeforePages = replyGenerate.mock.calls.length;
    await ConsultationPage({ params: Promise.resolve({ id: campaignId }) });
    await InterviewsPage({ params: Promise.resolve({ id: campaignId }) });
    await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforePages);
    expect(enqueue).not.toHaveBeenCalled();

    const asked = await askHarperAction(null, formData({ campaignId, question: UNCOVERED }));
    expect(asked.ok).toBe(true);
    expect(asked.message).not.toBe(consultationConversationCopy.askHarperFailed);
    expect(replyGenerate.mock.calls.length - callsBeforePages).toBe(1);
    const questionTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: UNCOVERED, followUp: false },
      include: { statements: true },
    });
    expect(questionTurn.statements[0]?.content).toContain(SAMPLE);
    expect(questionTurn.statements[0]?.content).not.toContain("Northwind");
    expect(questionTurn.statements[0]?.content).not.toContain("14");
    expect(questionTurn.statements[0]?.content).not.toContain("Globex");
    expect(questionTurn.statements[0]?.status).toBe("DRAFT");
    const followUp = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, targetKey: questionTurn.targetKey, followUp: true },
    });
    expect(followUp.body).toBe(FOLLOW_UP);
    const followUps = await prisma.consultationTurn.count({
      where: { organizationId, targetKey: questionTurn.targetKey, followUp: true },
    });
    expect(followUps).toBe(1);

    const harper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await act(async () => {
      root.render(harper);
    });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforePages + 1);
    const card = [...host.querySelectorAll("article")].find((item) =>
      item.textContent?.includes(UNCOVERED),
    );
    expect(card?.textContent).toContain(SAMPLE);
    expect(card?.querySelector("[data-testid=consultation-follow-up]")?.textContent).toBe(
      FOLLOW_UP,
    );
    expect(card?.textContent).toContain(consultationConversationCopy.followUpReplyHint);
    expect(card?.textContent).toContain(consultationConversationCopy.approve);
    expect(card?.textContent).toContain(consultationConversationCopy.threadReply);

    const callsBeforeRepeat = replyGenerate.mock.calls.length;
    const repeat = await askHarperAction(null, formData({ campaignId, question: UNCOVERED }));
    expect(repeat.ok).toBe(true);
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforeRepeat);

    const replied = await replyConsultationAction(
      null,
      formData({
        campaignId,
        answer: "I would use the first territory I opened.",
        targetKey: `question:${questionTurn.id}`,
      }),
    );
    expect(replied.ok).toBe(true);
    const seeker = await prisma.consultationTurn.findFirstOrThrow({
      where: {
        organizationId,
        speaker: "SEEKER",
        body: "I would use the first territory I opened.",
      },
    });
    const analysis = seeker.analysisJson as { replyToTurnId?: string };
    expect(analysis.replyToTurnId).toBe(followUp.id);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CONSULTATION",
        payload: { operation: "process_reply" },
      }),
    );
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforeRepeat);
  }, 60_000);

  it("stores and shows no follow-up on a best-practice suggested answer", async () => {
    if (!hasTestDatabase()) return;
    enqueue.mockClear();
    const callsBefore = replyGenerate.mock.calls.length;
    await ConsultationPage({ params: Promise.resolve({ id: campaignId }) });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBefore);
    expect(enqueue).not.toHaveBeenCalled();

    const session = await prisma.consultationSession.findFirstOrThrow({
      where: { organizationId, campaignId },
      select: { id: true },
    });
    const followUpText = "Which forecast review would you use as your example?";
    await storeRoleExpertiseQuestions({
      organizationId,
      sessionId: session.id,
      questions: [
        {
          text: "How do you run a weekly sales forecast review?",
          targetKey: "role-expertise:weekly-forecast-review",
          interviewTypeTag: "focused_competency",
          content: "I rebuild the review around the commits we already had.",
          grounding: {
            answerFramework: "CAR",
            challenge: "The Monday forecast review kept slipping.",
            action: "I rebuild the review around the commits we already had.",
            result: "The team caught the slip before the quarter closed.",
          },
          followUpQuestion: followUpText,
        },
      ],
    });
    const followUps = await prisma.consultationTurn.count({
      where: {
        organizationId,
        targetKey: "role-expertise:weekly-forecast-review",
        followUp: true,
      },
    });
    expect(followUps).toBe(0);

    const callsBeforeRender = replyGenerate.mock.calls.length;
    const harper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await act(async () => {
      root.render(harper);
    });
    expect(replyGenerate).toHaveBeenCalledTimes(callsBeforeRender);
    expect(enqueue).not.toHaveBeenCalled();
    const card = [...host.querySelectorAll("article")].find((item) =>
      item.textContent?.includes("How do you run a weekly sales forecast review?"),
    );
    expect(card?.textContent).toContain("rebuild the review around the commits");
    expect(card?.textContent).not.toContain(followUpText);
    expect(card?.querySelector("[data-testid=consultation-follow-up]")).toBeNull();
  }, 60_000);
});
