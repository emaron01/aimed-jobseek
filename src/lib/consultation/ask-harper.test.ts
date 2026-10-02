// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ConsultationPage from "@/app/(app)/campaigns/[id]/consultation/page";
import InterviewsPage from "@/app/(app)/campaigns/[id]/interviews/page";
import SummaryPage from "@/app/(app)/campaigns/[id]/summary/page";
import { askHarperAction } from "@/app/actions/ask-harper";
import {
  approveConsultationQaResultAction,
  approveConsultationStatementAction,
  editConsultationAnswerAction,
  useConsultationResultAction,
} from "@/app/actions/consultation";
import { ApplicationTrackerList } from "@/components/ApplicationSidebarTracker";
import { ConsultationSection } from "@/components/ConsultationSection";
import { InterviewStagesSection } from "@/components/InterviewStagesSection";
import { saveApplicationJobLearnedNotes } from "@/lib/application/service";
import {
  buildApplicationStepViews,
  emptyApplicationStepFacts,
} from "@/lib/application/step-progress";
import { applicationNextStepState } from "@/lib/application/next-step";
import { loadOrderedAnsweredHarperQuestions } from "@/lib/consultation/harper-display-qa";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import {
  applicationStepList,
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
import * as paid from "@/lib/ai/paid-call-gate";

const FACT = "Closed 14 deals at Northwind";
const QUESTION =
  "How did you keep the Northwind renewal when the buyer wanted to leave?";

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
  usePathname: () => "/campaigns/camp/job",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => createElement("a", { ...props, href }, children),
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

const paidSpy = vi.spyOn(paid, "runPaidStructuredCall");
const enqueue = vi.spyOn(jobs, "enqueueApplicationJob");

const ANSWER = {
  text: QUESTION,
  answerFramework: "CAR" as const,
  challenge: "The buyer wanted to leave.",
  situation: null,
  task: null,
  action: `I kept the record of ${FACT}.`,
  result: "The renewal stayed in place after that.",
};

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function paint(root: Root, node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

function bannerAbove(host: HTMLElement, header: Element | null) {
  const line = host.querySelector("[data-testid=ask-harper-line]");
  const button = host.querySelector("[data-testid=ask-harper-open]");
  expect(line?.textContent).toBe("Have an interview question you're stumped on?");
  expect(line?.className).toContain("font-bold");
  expect(line?.className).toContain("text-xl");
  expect(button?.textContent).toBe(consultationConversationCopy.askHarperAction);
  expect(button?.className).toContain("bg-bright-orange");
  expect(button?.className).toContain("text-black");
  expect(
    line!.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(header).toBeTruthy();
  expect(
    line!.compareDocumentPosition(header!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
}

describe("Ask Harper, sidebar order, and learned notes", () => {
  const suffix = `ask-harper-${Date.now()}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  let root: Root;
  let host: HTMLDivElement;
  let releaseFirst: (() => void) | null = null;

  beforeAll(async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    if (!hasTestDatabase()) return;
    const org = await prisma.organization.create({
      data: { name: `[TEST] Ask Harper ${suffix}`, slug: `ask-harper-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `ask-harper-${suffix}@example.test`,
        emailNormalized: `ask-harper-${suffix}@example.test`,
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
      data: {
        organizationId,
        name: `Ask Harper ${suffix}`,
        profileJson: profile,
      },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Ask Harper ${suffix}`,
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
        normalizedName: `northwind-ask-${suffix}`,
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
    replyGenerate.mockImplementation(async (request: { messages?: Array<{ content?: string }> }) => {
      if (!releaseFirst) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      const user = [...(request.messages ?? [])].reverse().find((message) =>
        message.content?.includes("\"questions\""),
      )?.content;
      let text = QUESTION;
      if (user) {
        try {
          const parsed = JSON.parse(user) as { questions?: Array<{ text?: string }> };
          if (parsed.questions?.[0]?.text) text = parsed.questions[0].text;
        } catch {
          text = QUESTION;
        }
      }
      return { data: { answers: [{ ...ANSWER, text }] } };
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

  it("shows Ask Harper above the three page headers and answers through the writing-model gate", async () => {
    if (!hasTestDatabase()) return;
    replyGenerate.mockClear();
    paidSpy.mockClear();
    enqueue.mockClear();

    await ConsultationPage({ params: Promise.resolve({ id: campaignId }) });
    await InterviewsPage({ params: Promise.resolve({ id: campaignId }) });
    const summary = await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    expect(replyGenerate).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    const harper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, harper);
    bannerAbove(host, host.querySelector("h2"));
    expect(host.querySelector("[data-testid=ask-harper-question]")).toBeNull();

    const notes = await InterviewStagesSection({
      campaignId,
      organizationId,
      canEdit: true,
      roles: [],
      contacts: [],
    });
    await paint(root, notes);
    bannerAbove(
      host,
      [...host.querySelectorAll("h2")].find((node) =>
        node.textContent?.includes("Interview Notes"),
      ) ?? null,
    );

    await paint(root, summary);
    bannerAbove(host, host.querySelector("h1"));
    expect(replyGenerate).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    await paint(root, harper);
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-testid=ask-harper-open]")?.click();
    });
    const field = host.querySelector<HTMLTextAreaElement>("[data-testid=ask-harper-question]");
    expect(field).toBeTruthy();
    const form = host.querySelector<HTMLFormElement>("[data-testid=ask-harper-form]");
    expect(form).toBeTruthy();
    const submit = form!.querySelector("button[type=submit]");
    expect(submit?.textContent).toBe(consultationConversationCopy.askHarperAction);
    expect(submit?.className).toContain("bg-bright-orange");
    expect(submit?.className).toContain("text-black");
    field!.value = QUESTION;
    const pending = act(async () => {
      form!.requestSubmit();
    });
    try {
      for (
        let i = 0;
        i < 400 &&
        (replyGenerate.mock.calls.length < 1 ||
          !host.querySelector("[data-testid=action-pending-spinner]"));
        i += 1
      ) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
      }
      expect(host.querySelector("[data-testid=action-pending-spinner]")).not.toBeNull();
      expect(replyGenerate.mock.calls.length).toBeGreaterThan(0);
    } finally {
      releaseFirst?.();
      await pending;
    }
    let storedTurn: { id: string } | null = null;
    for (let i = 0; i < 40 && !storedTurn; i += 1) {
      storedTurn = await prisma.consultationTurn.findFirst({
        where: { organizationId, body: QUESTION },
        select: { id: true },
      });
      if (!storedTurn) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
      }
    }
    expect(replyGenerate).toHaveBeenCalledTimes(1);
    const firstRequest = replyGenerate.mock.calls[0]?.[0] as {
      messages: Array<{ content: string }>;
    };
    const system = firstRequest.messages.map((message) => message.content).join("\n");
    expect(system).toContain("Keep every number, fraction, percentage, date, company, and name exactly as the person stated it.");
    expect(system).toContain(QUESTION);
    expect(system).toContain(FACT);
    const receiptsAfterAsk = await prisma.paidCallReceipt.findMany({
      where: { organizationId, operation: "ROLE_EXPERTISE_ANSWERS" },
    });
    expect(receiptsAfterAsk.map((row) => row.subjectKey)).toEqual([
      expect.stringContaining(`ask-harper:${campaignId}:`),
    ]);
    expect(enqueue).not.toHaveBeenCalled();

    const stored = await prisma.consultationTurn.findFirst({
      where: { organizationId, body: QUESTION },
      include: { statements: true },
    });
    expect(stored?.targetKey?.startsWith("ask-harper:")).toBe(true);
    expect(JSON.stringify(stored?.questionContextJson)).toContain("focused_competency");
    expect(stored?.statements[0]?.content).toContain(FACT);
    expect(stored?.statements[0]?.status).toBe("DRAFT");

    const harperAfter = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, harperAfter);
    const draftBox = host.querySelector("[data-testid=ask-harper-drafts]");
    expect(draftBox?.textContent).toContain(QUESTION);
    expect(draftBox?.textContent).toContain(FACT);
    expect(draftBox?.textContent).toContain(consultationStatementLabels.DRAFT);
    expect(draftBox?.textContent).toContain(consultationConversationCopy.approve);
    expect(draftBox?.textContent).toContain(consultationConversationCopy.threadReply);
    expect(host.querySelectorAll("[data-testid=ask-harper-drafts] [data-harper-question]")).toHaveLength(1);
    expect(host.querySelectorAll("[data-testid=harper-best-practice-list] [data-harper-question]")).toHaveLength(0);
    const summaryAfter = await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    await paint(root, summaryAfter);
    expect(host.querySelectorAll("#general-questions [data-harper-question]")).toHaveLength(0);
    expect(host.querySelector("[data-testid=ask-harper-drafts]")?.textContent).toContain(QUESTION);

    const beforeRepeat = replyGenerate.mock.calls.length;
    await askHarperAction(null, formData({ campaignId, question: QUESTION }));
    expect(replyGenerate.mock.calls.length).toBe(beforeRepeat);
    const receipts = await prisma.paidCallReceipt.count({
      where: {
        organizationId,
        operation: "ROLE_EXPERTISE_ANSWERS",
        subjectKey: { startsWith: `ask-harper:${campaignId}:` },
      },
    });
    expect(receipts).toBe(1);
    const turns = await prisma.consultationTurn.findMany({
      where: { organizationId, body: QUESTION },
    });
    expect(turns).toHaveLength(1);

    await paint(root, harperAfter);
    const approve = [...host.querySelectorAll("[data-testid=ask-harper-drafts] button")].find(
      (button) => button.textContent === consultationConversationCopy.approve,
    );
    expect(approve).toBeTruthy();
    const approving = act(async () => {
      approve?.closest("form")?.requestSubmit();
    });
    for (let i = 0; i < 200; i += 1) {
      const statement = await prisma.consultationStatement.findFirst({
        where: { turnId: stored!.id },
      });
      if (statement?.status === "APPROVED") break;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
    }
    await approving;
    const approved = await prisma.consultationStatement.findFirstOrThrow({
      where: { turnId: stored!.id },
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.content).toContain(FACT);

    const harperApproved = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, harperApproved);
    expect(host.querySelector("[data-testid=ask-harper-drafts]")).toBeNull();
    expect(
      host.querySelectorAll("[data-testid=harper-best-practice-list] [data-harper-question]"),
    ).toHaveLength(1);
    expect(
      host.querySelector("[data-testid=harper-best-practice-list]")?.textContent,
    ).toContain(QUESTION);
    expect(
      host.querySelector("[data-testid=harper-best-practice-list]")?.textContent,
    ).toContain(FACT);

    const summaryApproved = await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    await paint(root, summaryApproved);
    expect(host.querySelectorAll("#general-questions [data-harper-question]")).toHaveLength(1);
    expect(host.querySelector("#general-questions")?.textContent).toContain(QUESTION);
    expect(host.querySelector("#general-questions")?.textContent).toContain(FACT);
    expect(host.querySelector("[data-testid=ask-harper-drafts]")).toBeNull();

    const loaded = await loadOrderedAnsweredHarperQuestions({
      organizationId,
      campaignId,
    });
    const matches = loaded.generalQuestions.filter((item) => item.question === QUESTION);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.targetKey?.startsWith("ask-harper:")).toBe(true);
    expect(matches[0]?.interviewTypeTag).toBe("focused_competency");
    expect(replyGenerate).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  }, 60_000);

  it("orders Job requirements before Company and keeps step status by key", async () => {
    if (!hasTestDatabase()) return;
    const titles = applicationStepList.map((step) => `${step.number}. ${step.title}`);
    expect(titles.slice(0, 3)).toEqual([
      "1. Application Status",
      "2. Job requirements",
      "3. Company",
    ]);
    const facts = { ...emptyApplicationStepFacts(), hasJobTitle: true };
    const unseen = buildApplicationStepViews({
      campaignId,
      currentStep: "job",
      facts,
      jobs: [],
      seen: {},
    });
    expect(unseen.find((step) => step.key === "job")?.hasNew).toBe(true);
    expect(unseen.find((step) => step.key === "company")?.state).toBe("not_started");
    const steps = buildApplicationStepViews({
      campaignId,
      currentStep: "job",
      facts,
      jobs: [],
      seen: { job: "job:ready" },
    });
    expect(steps.map((step) => step.key).slice(0, 3)).toEqual(["applied", "job", "company"]);
    expect(steps.find((step) => step.key === "job")?.state).toBe("done");
    expect(steps.find((step) => step.key === "company")?.state).toBe("not_started");
    expect(steps.find((step) => step.key === "job")?.href).toBe(`/campaigns/${campaignId}/job`);
    expect(steps.find((step) => step.key === "company")?.href).toBe(
      `/campaigns/${campaignId}/company`,
    );
    expect(
      applicationNextStepState({
        consultationStatus: null,
        consultationGenerationStatus: null,
        resumePlanStatus: null,
        coverPlanStatus: null,
        hasResume: false,
        hasCoverLetter: false,
        appliedAt: null,
      }).key,
    ).toBe("consultation_not_started");

    await paint(
      root,
      createElement(ApplicationTrackerList, {
        variant: "sidebar",
        tracker: {
          campaignId,
          campaignName: "Ask Harper",
          currentStep: "job",
          steps,
        },
      }),
    );
    const labels = [...host.querySelectorAll("a[data-testid^=tracker-step-]")].map(
      (node) => node.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(labels[0]).toContain("1. Application Status");
    expect(labels[1]).toContain("2. Job requirements");
    expect(labels[2]).toContain("3. Company");
    expect(host.querySelector("[data-testid=tracker-step-job]")?.getAttribute("aria-current")).toBe(
      "page",
    );
    expect(
      host.querySelector("[data-testid=tracker-step-job] [aria-label]")?.getAttribute("aria-label"),
    ).toBe("Done");
    expect(
      host
        .querySelector("[data-testid=tracker-step-company] [aria-label]")
        ?.getAttribute("aria-label"),
    ).toBe("Not started");
  });

  it("saves learned notes without a cheat sheet job or a paid call", async () => {
    if (!hasTestDatabase()) return;
    replyGenerate.mockClear();
    paidSpy.mockClear();
    enqueue.mockClear();
    const before = await prisma.applicationJob.count({
      where: { campaignId, type: "APPLICATION_SUMMARY" },
    });
    await saveApplicationJobLearnedNotes({
      organizationId,
      campaignId,
      userId,
      notes: "They care about renewal hygiene.",
    });
    const after = await prisma.applicationJob.count({
      where: { campaignId, type: "APPLICATION_SUMMARY" },
    });
    expect(after).toBe(before);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();
    const requirement = await prisma.jobRequirement.findUniqueOrThrow({ where: { campaignId } });
    expect(requirement.seekerLearnedNotes).toBe("They care about renewal hygiene.");
  });

  it("approves Ask Harper answers without a planning job and still continues other answers", async () => {
    if (!hasTestDatabase()) return;
    replyGenerate.mockClear();
    paidSpy.mockClear();
    enqueue.mockClear();

    await ConsultationPage({ params: Promise.resolve({ id: campaignId }) });
    await InterviewsPage({ params: Promise.resolve({ id: campaignId }) });
    await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    expect(replyGenerate).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();

    const first = "How did you keep the Northwind account when the champion changed?";
    const drafted = await askHarperAction(null, formData({ campaignId, question: first }));
    expect(drafted.ok).toBe(true);
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();

    const firstTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: first, speaker: "CONSULTANT" },
      include: { statements: true },
    });
    const firstStatement = firstTurn.statements[0];
    expect(firstStatement?.status).toBe("DRAFT");
    const approvedFirst = await approveConsultationQaResultAction(
      null,
      formData({ campaignId, statementId: firstStatement!.id }),
    );
    expect(approvedFirst.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();

    const harper = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, harper);
    expect(
      [...host.querySelectorAll("[data-testid=harper-best-practice-list] [data-harper-question]")]
        .filter((node) => node.textContent?.includes(first)),
    ).toHaveLength(1);
    const summary = await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    await paint(root, summary);
    expect(
      [...host.querySelectorAll("#general-questions [data-harper-question]")]
        .filter((node) => node.textContent?.includes(first)),
    ).toHaveLength(1);

    const editedQuestion = "How did you hold the Northwind renewal through the champion change?";
    const editedDraft = await askHarperAction(
      null,
      formData({ campaignId, question: editedQuestion }),
    );
    expect(editedDraft.ok).toBe(true);
    const editedTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: editedQuestion, speaker: "CONSULTANT" },
      include: { statements: true, session: true },
    });
    const latest = await prisma.consultationTurn.findFirst({
      where: { sessionId: editedTurn.sessionId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const seeker = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: editedTurn.sessionId,
        sequence: (latest?.sequence ?? 0) + 1,
        speaker: "SEEKER",
        body: "I stayed with the buyer until the renewal closed.",
        targetKey: editedTurn.targetKey,
        followUp: false,
        analysisJson: { status: "COMPLETE", replyToTurnId: editedTurn.id },
      },
    });
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const edited = await editConsultationAnswerAction(
      null,
      formData({
        campaignId,
        turnId: seeker.id,
        answer: "I stayed with the buyer until the Northwind renewal closed.",
      }),
    );
    expect(edited.ok).toBe(true);
    expect(enqueue.mock.calls.some((call) => call[0]?.payload?.operation === "continue")).toBe(
      false,
    );
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const approvedAfterEdit = await approveConsultationQaResultAction(
      null,
      formData({ campaignId, statementId: editedTurn.statements[0]!.id }),
    );
    expect(approvedAfterEdit.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();

    const pendingQuestion = "What kept the Northwind buyer from leaving in the last month?";
    const pendingDraft = await askHarperAction(
      null,
      formData({ campaignId, question: pendingQuestion }),
    );
    expect(pendingDraft.ok).toBe(true);
    const pendingTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: pendingQuestion, speaker: "CONSULTANT" },
      include: { statements: true },
    });
    const pendingLatest = await prisma.consultationTurn.findFirst({
      where: { sessionId: pendingTurn.sessionId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const pendingSeeker = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: pendingTurn.sessionId,
        sequence: (pendingLatest?.sequence ?? 0) + 1,
        speaker: "SEEKER",
        body: "I wrote the renewal plan down.",
        targetKey: pendingTurn.targetKey,
        followUp: false,
        analysisJson: { status: "COMPLETE", replyToTurnId: pendingTurn.id },
      },
    });
    const pendingStatement = await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: pendingTurn.sessionId,
        turnId: pendingSeeker.id,
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: `The renewal plan kept ${FACT} in place.`,
        groundingJson: [],
        promptVersion: pendingTurn.statements[0]?.promptVersion ?? "36",
      },
    });
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const approvedPending = await approveConsultationQaResultAction(
      null,
      formData({ campaignId, statementId: pendingStatement.id }),
    );
    expect(approvedPending.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    await prisma.consultationStatement.update({
      where: { id: pendingTurn.statements[0]!.id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });

    const statementQuestion = "Who on the Northwind team signed the renewal?";
    const statementDraft = await askHarperAction(
      null,
      formData({ campaignId, question: statementQuestion }),
    );
    expect(statementDraft.ok).toBe(true);
    const statementTurn = await prisma.consultationTurn.findFirstOrThrow({
      where: { organizationId, body: statementQuestion, speaker: "CONSULTANT" },
      include: { statements: true },
    });
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const approvedStatement = await approveConsultationStatementAction(
      null,
      formData({
        campaignId,
        statementId: statementTurn.statements[0]!.id,
        content: statementTurn.statements[0]!.content,
      }),
    );
    expect(approvedStatement.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();

    const bulkQuestion = "Which Northwind objection did you answer last?";
    const bulkDraft = await askHarperAction(
      null,
      formData({ campaignId, question: bulkQuestion }),
    );
    expect(bulkDraft.ok).toBe(true);
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const bulkApproved = await useConsultationResultAction(
      null,
      formData({ campaignId }),
    );
    expect(bulkApproved.ok).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();
    const harperBulk = await ConsultationSection({
      campaignId,
      organizationId,
      canEdit: true,
      jobs: [],
    });
    await paint(root, harperBulk);
    expect(
      [...host.querySelectorAll("[data-testid=harper-best-practice-list] [data-harper-question]")]
        .filter((node) => node.textContent?.includes(bulkQuestion)),
    ).toHaveLength(1);
    const summaryBulk = await SummaryPage({
      params: Promise.resolve({ id: campaignId }),
      searchParams: Promise.resolve({}),
    });
    await paint(root, summaryBulk);
    expect(
      [...host.querySelectorAll("#general-questions [data-harper-question]")]
        .filter((node) => node.textContent?.includes(bulkQuestion)),
    ).toHaveLength(1);

    const sessionRow = await prisma.consultationSession.findUniqueOrThrow({
      where: { campaignId },
    });
    const otherLatest = await prisma.consultationTurn.findFirst({
      where: { sessionId: sessionRow.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const otherTurn = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: sessionRow.id,
        sequence: (otherLatest?.sequence ?? 0) + 1,
        speaker: "CONSULTANT",
        body: "Tell me about a time you shipped a service.",
        targetKey: "required:python",
        followUp: false,
      },
    });
    const otherStatement = await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: sessionRow.id,
        turnId: otherTurn.id,
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: "I shipped the motion-planning service.",
        groundingJson: [],
        promptVersion: "36",
      },
    });
    enqueue.mockClear();
    paidSpy.mockClear();
    replyGenerate.mockClear();
    const approvedOther = await approveConsultationQaResultAction(
      null,
      formData({ campaignId, statementId: otherStatement.id }),
    );
    expect(approvedOther.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      type: "CONSULTATION",
      payload: { operation: "continue" },
    });
    expect(paidSpy).not.toHaveBeenCalled();
    expect(replyGenerate).not.toHaveBeenCalled();

    const otherTurnTwo = await prisma.consultationTurn.create({
      data: {
        organizationId,
        sessionId: sessionRow.id,
        sequence: (otherLatest?.sequence ?? 0) + 2,
        speaker: "CONSULTANT",
        body: "Tell me about a time you led an incident.",
        targetKey: "required:incident",
        followUp: false,
      },
    });
    await prisma.consultationStatement.create({
      data: {
        organizationId,
        sessionId: sessionRow.id,
        turnId: otherTurnTwo.id,
        kind: "INTERVIEW_ANSWER",
        status: "DRAFT",
        content: "I led the incident response.",
        groundingJson: [],
        promptVersion: "36",
      },
    });
    enqueue.mockClear();
    paidSpy.mockClear();
    const approvedBulkOther = await useConsultationResultAction(
      null,
      formData({ campaignId }),
    );
    expect(approvedBulkOther.ok).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toMatchObject({
      type: "CONSULTATION",
      payload: { operation: "continue" },
    });
    expect(paidSpy).not.toHaveBeenCalled();
  }, 60_000);
});
