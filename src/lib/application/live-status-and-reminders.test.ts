// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ApplicationActionForm } from "@/components/ApplicationActionForm";
import { ApplicationAssetsSection } from "@/components/ApplicationAssetsSection";
import { ApplicationOutreachSection } from "@/components/ApplicationOutreachSections";
import { ApplicationRemindersPanel } from "@/components/ApplicationRemindersPanel";
import { RefreshLikelyQuestionsButton } from "@/components/CheatSheetPersonBody";
import { ResultActions } from "@/components/ConsultationThread";
import { WorkspaceJobsProvider } from "@/components/workspace-jobs-context";
import {
  groupDueApplicationReminders,
  type ApplicationReminderRow,
} from "@/lib/cadence/application-reminders";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { createInterviewStage } from "@/lib/interview/stages";
import {
  applicationSummaryConfig,
  consultationConversationCopy,
  hiringTeamConfig,
  outreachConfig,
  workspaceJobFailureMessage,
  workspaceProgressText,
} from "@/lib/product-config";
import { hasTestDatabase } from "@/test/database";
import { prisma } from "@/lib/prisma-client";

const harperAction = vi.hoisted(() => vi.fn());
const refreshAction = vi.hoisted(() => vi.fn());
const personaAction = vi.hoisted(() => vi.fn());
const outreachAction = vi.hoisted(() => vi.fn());
const assetAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/assets",
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
}));

vi.mock("@/app/actions/consultation", () => ({
  approveConsultationQaResultAction: (...args: unknown[]) => harperAction(...args),
  editConsultationAnswerAction: vi.fn(),
  regenerateConsultationQaResultAction: vi.fn(),
  replyConsultationAction: vi.fn(),
  skipConsultationQuestionAction: vi.fn(),
  ignoreConsultationQuestionAction: vi.fn(),
  reopenIgnoredConsultationTargetAction: vi.fn(),
}));

vi.mock("@/app/actions/application-summary", () => ({
  generateApplicationSummaryAction: (...args: unknown[]) => refreshAction(...args),
  buildCheatSheetPersonaAction: vi.fn(),
  answerCheatSheetCoachAction: vi.fn(),
  approveCheatSheetSampleAction: vi.fn(),
  saveCheatSheetSampleDraftAction: vi.fn(),
}));

vi.mock("@/app/actions/hiring-team", () => ({
  buildApplicationRoleAction: (...args: unknown[]) => personaAction(...args),
  rebuildApplicationRoleAction: vi.fn(),
  buildAllDirectRolesAction: vi.fn(),
}));

vi.mock("@/app/actions/application-outreach", () => ({
  generateOutreachAssetAction: (...args: unknown[]) => outreachAction(...args),
  addApplicationContactAction: vi.fn(),
  buildOutreachPersonaThenGenerateAction: vi.fn(),
  markApplicationAppliedAction: vi.fn(),
  setApplicationProgressAction: vi.fn(),
  markOutreachSentAction: vi.fn(),
  updateApplicationContactRoleAction: vi.fn(),
}));

vi.mock("@/app/actions/application-assets", () => ({
  generateApplicationAssetAction: (...args: unknown[]) => assetAction(...args),
  approveApplicationAssetAction: vi.fn(),
  saveEditedApplicationAssetAction: vi.fn(),
}));

function job(
  id: string,
  status: WorkspaceJobStatusView["status"],
  error: string | null = null,
): WorkspaceJobStatusView {
  return {
    id,
    type: "CONSULTATION",
    status,
    targetId: null,
    error,
    canRetry: status === "FAILED",
    progressText: "Working…",
    waitKind: "stayAndWatch",
    sectionId: "consultation",
    readyText: "Ready.",
  };
}

function hosted(jobs: WorkspaceJobStatusView[], child: ReactNode) {
  return createElement(WorkspaceJobsProvider, { initialJobs: jobs } as never, child);
}

async function paint(root: Root, node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
}

async function open(node: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await paint(root, node);
  return {
    container,
    async update(next: ReactNode) {
      await paint(root, next);
    },
    async close() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

async function submit(form: HTMLFormElement) {
  await act(async () => {
    form.requestSubmit();
  });
}

function spinner(container: ParentNode): Element | null {
  return container.querySelector("[data-testid='action-pending-spinner']");
}

function requireForm(container: ParentNode, selector: string): HTMLFormElement {
  const form = container.querySelector(selector);
  if (!(form instanceof HTMLFormElement)) {
    throw new Error(`Form ${selector} was not rendered.`);
  }
  return form;
}

async function expectTracked(input: {
  node: (jobs: WorkspaceJobStatusView[]) => ReactNode;
  selector: string;
  jobId: string;
  message: string;
}) {
  const failure = "The draft could not be written.";
  const view = await open(input.node([job(input.jobId, "PENDING")]));
  expect(spinner(view.container)).toBeNull();
  await submit(requireForm(view.container, input.selector));
  expect(view.container.textContent).toContain(input.message);
  expect(spinner(view.container)).toBeTruthy();

  await view.update(input.node([job(input.jobId, "IN_PROGRESS")]));
  expect(view.container.textContent).toContain(input.message);
  expect(spinner(view.container)).toBeTruthy();

  await view.update(input.node([job(input.jobId, "COMPLETED")]));
  expect(view.container.textContent ?? "").not.toContain(input.message);
  expect(spinner(view.container)).toBeNull();
  await view.close();

  const failed = await open(input.node([job(input.jobId, "FAILED", failure)]));
  await submit(requireForm(failed.container, input.selector));
  expect(failed.container.textContent).toContain(failure);
  expect(failed.container.textContent).toContain(workspaceJobFailureMessage(failure));
  expect(spinner(failed.container)).toBeNull();
  await failed.close();
}

function reminder(overrides: Partial<ApplicationReminderRow>): ApplicationReminderRow {
  return {
    campaignId: "camp-csc",
    campaignName: "CSC Sr. Director",
    kind: "INTERVIEW_THANK_YOU",
    appliedAt: new Date("2026-09-01T00:00:00.000Z"),
    stageId: "stage-1",
    stageLabel: "HIRING_MANAGER",
    anchorAt: new Date("2026-09-30T15:00:00.000Z"),
    day: 0,
    dueAt: new Date("2026-10-01T15:00:00.000Z"),
    urgency: "today",
    recordNotesFirst: true,
    ...overrides,
  };
}

const now = new Date("2026-10-01T18:00:00.000Z");

describe("live inline action status", () => {
  it("makes no paid call and enqueues no job on render", () => {
    for (const path of [
      "src/components/InlineActionStatus.tsx",
      "src/components/ApplicationActionForm.tsx",
      "src/components/ApplicationRemindersPanel.tsx",
      "src/components/workspace-jobs-context.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/runPaidStructuredCall|enqueueApplicationJob/);
    }
    expect(harperAction).not.toHaveBeenCalled();
    expect(refreshAction).not.toHaveBeenCalled();
    expect(outreachAction).not.toHaveBeenCalled();
    expect(assetAction).not.toHaveBeenCalled();
    expect(personaAction).not.toHaveBeenCalled();
  });

  it("shows the shared spinner for Harper until that job finishes", async () => {
    harperAction.mockResolvedValue({
      ok: true,
      message: consultationConversationCopy.confirmed,
      jobId: "harper-job",
    });
    await expectTracked({
      jobId: "harper-job",
      message: consultationConversationCopy.confirmed,
      selector: "[data-testid='harper-result-approve']",
      node: (jobs) =>
        hosted(
          jobs,
          createElement(ResultActions, {
            campaignId: "camp",
            testId: "harper-result",
            statements: [
              {
                id: "statement-1",
                turnId: "turn-1",
                kind: "INTERVIEW_ANSWER",
                status: "DRAFT",
                content: "Lead with the forecast.",
                strengtheningNote: null,
              },
            ],
          }),
        ),
    });
  });

  it("shows Refreshing likely questions… with the spinner, and a no-change result without one", async () => {
    refreshAction.mockResolvedValue({
      ok: true,
      message: applicationSummaryConfig.actions.refreshingLikelyQuestions,
      jobId: "sheet-job",
    });
    await expectTracked({
      jobId: "sheet-job",
      message: "Refreshing likely questions…",
      selector: "[data-testid='refresh-likely-questions-contact:c-1']",
      node: (jobs) =>
        hosted(
          jobs,
          createElement(RefreshLikelyQuestionsButton, {
            campaignId: "camp",
            sectionKey: "contact:c-1",
          }),
        ),
    });

    refreshAction.mockResolvedValue({
      ok: true,
      message: applicationSummaryConfig.actions.unchangedLikelyQuestions,
    });
    const unchanged = await open(
      hosted(
        [],
        createElement(RefreshLikelyQuestionsButton, {
          campaignId: "camp",
          sectionKey: "contact:c-1",
        }),
      ),
    );
    await submit(
      requireForm(
        unchanged.container,
        "[data-testid='refresh-likely-questions-contact:c-1']",
      ),
    );
    expect(unchanged.container.textContent).toContain("No Changes To Likely Questions");
    expect(spinner(unchanged.container)).toBeNull();
    await unchanged.close();
  });

  it("shows the shared spinner for Send Outreach", async () => {
    outreachAction.mockResolvedValue({
      ok: true,
      message: workspaceProgressText("OUTREACH"),
      jobId: "outreach-job",
    });
    await expectTracked({
      jobId: "outreach-job",
      message: workspaceProgressText("OUTREACH"),
      selector: "form:has([data-testid='outreach-generator-prompt'])",
      node: (jobs) =>
        hosted(
          jobs,
          createElement(ApplicationOutreachSection, {
            campaignId: "camp",
            canEdit: true,
            roles: [
              {
                id: "role-1",
                name: "Hiring manager",
                suggestionKey: null,
                personaBuilt: true,
              },
            ],
            contacts: [
              {
                contactId: "contact-1",
                firstName: "Ada",
                lastName: "Lovelace",
                title: "Director",
                email: "ada@example.test",
                linkedinUrl: null,
                personaId: "role-1",
                personaName: "Hiring manager",
                roleConfirmed: true,
                linkedInProfileText: null,
                extractedTitle: null,
                individualStatus: null,
                individualError: null,
                commonGround: [],
                caresAbout: [],
              },
            ],
            assets: [],
            interviewStages: [],
            approvedResumeId: null,
          }),
        ),
    });
  });

  it("shows the shared spinner for a persona build", async () => {
    personaAction.mockResolvedValue({
      ok: true,
      message: hiringTeamConfig.queuedBuild,
      jobId: "persona-job",
    });
    await expectTracked({
      jobId: "persona-job",
      message: hiringTeamConfig.queuedBuild,
      selector: "[data-testid='build-persona']",
      node: (jobs) =>
        hosted(
          jobs,
          createElement(
            ApplicationActionForm,
            {
              action: personaAction,
              submitLabel: hiringTeamConfig.actions.build,
              testId: "build-persona",
            } as never,
            createElement("input", {
              type: "hidden",
              name: "personaId",
              value: "role-1",
            }),
          ),
        ),
    });
  });

  it("shows the shared spinner for resume and cover letter generation", async () => {
    assetAction.mockImplementation(async (_previous: unknown, formData: FormData) => {
      const type = String(formData.get("type"));
      return {
        ok: true,
        message: workspaceProgressText(type === "COVER_LETTER" ? "COVER_LETTER" : "RESUME"),
        jobId: type === "COVER_LETTER" ? "cover-job" : "resume-job",
      };
    });
    const resume = await open(
      hosted(
        [job("resume-job", "PENDING")],
        createElement(ApplicationAssetsSection, {
          campaignId: "camp",
          assets: [],
          profileRoles: [],
          plans: [],
          canEdit: true,
          defaultOpen: true,
        }),
      ),
    );
    const resumeForm = requireForm(resume.container, "#resume-document form");
    await submit(resumeForm);
    expect(resume.container.textContent).toContain(workspaceProgressText("RESUME"));
    expect(spinner(resumeForm)).toBeTruthy();
    await resume.update(
      hosted(
        [job("resume-job", "IN_PROGRESS")],
        createElement(ApplicationAssetsSection, {
          campaignId: "camp",
          assets: [],
          profileRoles: [],
          plans: [],
          canEdit: true,
          defaultOpen: true,
        }),
      ),
    );
    expect(resume.container.textContent).toContain(workspaceProgressText("RESUME"));
    expect(spinner(resume.container)).toBeTruthy();
    await resume.update(
      hosted(
        [job("resume-job", "COMPLETED")],
        createElement(ApplicationAssetsSection, {
          campaignId: "camp",
          assets: [],
          profileRoles: [],
          plans: [],
          canEdit: true,
          defaultOpen: true,
        }),
      ),
    );
    expect(resume.container.textContent ?? "").not.toContain(workspaceProgressText("RESUME"));
    expect(spinner(resume.container)).toBeNull();
    await resume.close();

    const cover = await open(
      hosted(
        [job("cover-job", "FAILED", "The draft could not be written.")],
        createElement(ApplicationAssetsSection, {
          campaignId: "camp",
          assets: [],
          profileRoles: [],
          plans: [],
          canEdit: true,
          defaultOpen: true,
        }),
      ),
    );
    await submit(requireForm(cover.container, "#cover-letter-document form"));
    expect(cover.container.textContent).toContain("The draft could not be written.");
    const coverDocument = cover.container.querySelector("#cover-letter-document");
    expect(coverDocument).toBeTruthy();
    expect(spinner(coverDocument ?? cover.container)).toBeNull();
    await cover.close();
  });
});

describe("due follow-up reminders", () => {
  const rows: ApplicationReminderRow[] = [
    reminder({}),
    reminder({ stageId: "stage-duplicate" }),
    reminder({
      kind: "OUTREACH",
      stageId: undefined,
      stageLabel: undefined,
      day: 3,
      dueAt: new Date("2026-10-01T12:00:00.000Z"),
      recordNotesFirst: false,
    }),
    reminder({
      kind: "OUTREACH",
      stageId: undefined,
      stageLabel: undefined,
      day: 7,
      dueAt: new Date("2026-10-08T12:00:00.000Z"),
      recordNotesFirst: false,
    }),
    reminder({
      campaignId: "camp-future",
      campaignName: "Future only",
      kind: "INTERVIEW_CHECK_IN",
      stageId: "stage-future",
      stageLabel: "RECRUITER_SCREEN",
      dueAt: new Date("2026-10-20T12:00:00.000Z"),
      recordNotesFirst: false,
    }),
    reminder({
      campaignId: "camp-boundary",
      campaignName: "Boundary",
      dueAt: new Date("2026-10-02T03:00:00.000Z"),
      stageId: "stage-boundary",
      recordNotesFirst: false,
    }),
  ];

  it("counts only due-today and past-due reminders, once per duplicate, in the seeker's time zone", () => {
    const eastern = groupDueApplicationReminders({
      reminders: rows,
      now,
      timezone: "America/New_York",
    });
    expect(eastern).toEqual([
      { campaignId: "camp-csc", campaignName: "CSC Sr. Director", count: 2 },
      { campaignId: "camp-boundary", campaignName: "Boundary", count: 1 },
    ]);
    const utc = groupDueApplicationReminders({
      reminders: rows,
      now,
      timezone: "UTC",
    });
    expect(utc.map((group) => group.campaignId)).toEqual(["camp-csc"]);
    expect(utc[0]?.count).toBe(2);
  });

  it("renders one line per application with the exact text and hides applications with nothing due", async () => {
    const view = await open(
      createElement(ApplicationRemindersPanel, {
        reminders: rows,
        now,
        timezone: "America/New_York",
      }),
    );
    const line = outreachConfig.labels.remindersDueLine.replace("{count}", "2");
    expect(line).toBe(
      "You may have 2 outbound due. Review Interview stages and Send Outreach to take action.",
    );
    expect(view.container.textContent).toContain("CSC Sr. Director");
    expect(view.container.textContent).toContain(line);
    expect(view.container.textContent).toContain(
      "You may have 1 outbound due. Review Interview stages and Send Outreach to take action.",
    );
    expect(view.container.textContent).toContain("Open application");
    expect(view.container.textContent).toContain(outreachConfig.labels.remindersHelp);
    expect(view.container.textContent).not.toContain("Future only");
    expect(view.container.textContent).not.toContain("Day 7");
    const links = [...view.container.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(links).toContain("/campaigns/camp-csc");
    expect(links).not.toContain("/campaigns/camp-future");
    expect(view.container.querySelectorAll("[data-testid^='application-reminder-']")).toHaveLength(2);
    await view.close();
  });
});

describe.skipIf(!hasTestDatabase())("duplicate thank-you stage", () => {
  const suffix = `live-status-${Date.now().toString(36)}`;
  let organizationId = "";
  let userId = "";
  let campaignId = "";

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: `[TEST] Live status ${suffix}`, slug: `live-status-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `live-status-${suffix}@example.test`,
        emailNormalized: `live-status-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Live status product ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `Live status ICP ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: "CSC Sr. Director",
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (!organizationId) return;
    await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
  });

  it("stores one stage when the same interview is submitted twice", async () => {
    const scheduledAt = new Date("2026-10-01T15:00:00.000Z");
    const input = {
      organizationId,
      campaignId,
      userId,
      type: "HIRING_MANAGER",
      scheduledAt,
      format: "VIDEO",
    };
    const [first, second] = await Promise.all([
      createInterviewStage(input),
      createInterviewStage(input),
    ]);
    expect(first.id).toBe(second.id);
    const stored = await prisma.interviewStage.count({
      where: { campaignId, type: "HIRING_MANAGER", scheduledAt },
    });
    expect(stored).toBe(1);
  });
});
