// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { useEffect, act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineActionStatus } from "@/components/InlineActionStatus";
import {
  useReplaceWorkspaceJobs,
  WorkspaceJobsProvider,
} from "@/components/workspace-jobs-context";
import type { WorkspaceJobStatusView } from "@/lib/application-jobs/workspace-status";
import { workspaceJobFailureMessage } from "@/lib/product-config";

const readJobs = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions/application-jobs", () => ({
  readApplicationJobStatusesAction: (...args: unknown[]) => readJobs(...args),
}));

function job(
  id: string,
  status: WorkspaceJobStatusView["status"],
  error: string | null = null,
): WorkspaceJobStatusView {
  return {
    id,
    type: "APPLICATION_SUMMARY",
    status,
    targetId: null,
    error,
    canRetry: status === "FAILED",
    progressText: "Working…",
    waitKind: "longer",
    sectionId: "summary",
    readyText: "Ready.",
  };
}

function hosted(jobs: WorkspaceJobStatusView[], child: ReactNode) {
  return createElement(
    WorkspaceJobsProvider,
    { initialJobs: jobs, campaignId: "camp" } as never,
    child,
  );
}

function status(jobId: string, message: string) {
  return createElement(InlineActionStatus, {
    result: { ok: true, message, jobId },
    testId: "inline-action-status",
  });
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

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function spinner(container: ParentNode): Element | null {
  return container.querySelector("[data-testid='action-pending-spinner']");
}

function DropPublishedJobs() {
  const replace = useReplaceWorkspaceJobs();
  useEffect(() => {
    replace([]);
  }, [replace]);
  return null;
}

describe("inline status resolution", () => {
  beforeEach(() => {
    readJobs.mockReset();
  });

  it("makes no paid call and enqueues no job on render", async () => {
    readJobs.mockResolvedValue([]);
    for (const path of [
      "src/components/InlineActionStatus.tsx",
      "src/components/workspace-jobs-context.tsx",
      "src/components/ApplicationWorkspaceLive.tsx",
    ]) {
      expect(readFileSync(path, "utf8")).not.toMatch(
        /runPaidStructuredCall|enqueueApplicationJob/,
      );
    }
    const action = readFileSync("src/app/actions/application-jobs.ts", "utf8");
    const readFn = action.slice(
      action.indexOf("export async function readApplicationJobStatusesAction"),
      action.indexOf("export async function getApplicationTrackerAction"),
    );
    expect(readFn).toContain("getWorkspaceJobsByIds");
    expect(readFn).not.toMatch(/runPaidStructuredCall|enqueueApplicationJob/);
    const view = await open(hosted([], status("render-job", "Working…")));
    await settle();
    expect(readJobs).toHaveBeenCalled();
    await view.close();
  });

  it("clears when a job completed before the first poll", async () => {
    readJobs.mockResolvedValue([job("fast-job", "COMPLETED")]);
    const view = await open(hosted([], status("fast-job", "Refreshing likely questions…")));
    await settle();
    expect(readJobs).toHaveBeenCalledWith("camp", ["fast-job"]);
    expect(spinner(view.container)).toBeNull();
    expect(view.container.textContent ?? "").not.toContain("Refreshing likely questions…");
    await view.close();
  });

  it("shows the failure message when a job failed before the first poll", async () => {
    const failure = "The draft could not be written.";
    readJobs.mockResolvedValue([job("failed-fast", "FAILED", failure)]);
    const view = await open(hosted([], status("failed-fast", "Writing the Interview cheat sheet…")));
    await settle();
    expect(spinner(view.container)).toBeNull();
    expect(view.container.textContent).toContain(workspaceJobFailureMessage(failure));
    await view.close();
  });

  it("watches the existing job an action joined and clears when that job completes", async () => {
    const message = "Building…";
    const view = await open(
      hosted([job("existing-job", "IN_PROGRESS")], status("existing-job", message)),
    );
    expect(readJobs).not.toHaveBeenCalled();
    expect(spinner(view.container)).toBeTruthy();
    expect(view.container.textContent).toContain(message);
    await view.update(
      hosted([job("existing-job", "COMPLETED")], status("existing-job", message)),
    );
    expect(spinner(view.container)).toBeNull();
    expect(view.container.textContent ?? "").not.toContain(message);
    await view.close();
  });

  it("clears a gated skip that completed without a paid call", async () => {
    readJobs.mockResolvedValue([job("gated-job", "COMPLETED")]);
    const view = await open(hosted([], status("gated-job", "Saving…")));
    await settle();
    expect(spinner(view.container)).toBeNull();
    expect(view.container.textContent ?? "").not.toContain("Saving…");
    await view.close();
  });

  it("does not keep spinning after the watched job has completed or failed", async () => {
    readJobs.mockResolvedValue([job("done-job", "COMPLETED")]);
    const done = await open(hosted([], status("done-job", "Working…")));
    await settle();
    expect(spinner(done.container)).toBeNull();
    await done.update(
      hosted(
        [],
        createElement(
          "div",
          null,
          status("done-job", "Working…"),
          createElement(DropPublishedJobs),
        ),
      ),
    );
    await settle();
    expect(spinner(done.container)).toBeNull();
    expect(done.container.textContent ?? "").not.toContain("Working…");
    await done.close();

    readJobs.mockResolvedValue([]);
    const absent = await open(hosted([], status("missing-job", "Working…")));
    await settle();
    expect(spinner(absent.container)).toBeNull();
    expect(absent.container.textContent).toContain(workspaceJobFailureMessage(null));
    await absent.close();

    const failure = "This did not finish. Retry.";
    readJobs.mockResolvedValue([job("bad-job", "FAILED", failure)]);
    const failed = await open(hosted([], status("bad-job", "Working…")));
    await settle();
    expect(spinner(failed.container)).toBeNull();
    expect(failed.container.textContent).toContain(failure);
    await failed.close();
  });
});
