import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { paidCallResultJson } from "@/lib/ai/paid-call-gate";
import {
  OUTREACH_GENERATION_FAILURE_MESSAGE,
} from "@/lib/application-assets/ai";
import {
  composeOutreachText,
  emailAssetContentSchema,
  linkedinInmailAssetContentSchema,
  linkedinNoteAssetContentSchema,
} from "@/lib/application-assets/contract";
import { outreachWritingForContact } from "@/components/ApplicationOutreachSections";
import { activeWorkspaceJobs } from "@/lib/application-jobs/workspace-status";
import { isRetryableProviderMessage } from "@/lib/application-jobs/types";
import { outreachConfig } from "@/lib/product-config";

const receipts = vi.hoisted(
  () => new Map<string, { inputHash: string; resultJson: unknown }>(),
);

vi.mock("@/lib/prisma-client", () => ({
  prisma: {
    paidCallReceipt: {
      findUnique: async ({
        where,
      }: {
        where: {
          organizationId_operation_subjectKey: { subjectKey: string };
        };
      }) =>
        receipts.get(where.organizationId_operation_subjectKey.subjectKey) ??
        null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          organizationId_operation_subjectKey: { subjectKey: string };
        };
        create: { inputHash: string; resultJson: unknown };
        update: { inputHash: string; resultJson: unknown };
      }) => {
        const key = where.organizationId_operation_subjectKey.subjectKey;
        const next = {
          inputHash: update.inputHash || create.inputHash,
          resultJson: update.resultJson ?? create.resultJson,
        };
        receipts.set(key, next);
        return next;
      },
    },
  },
}));

const support = [{ sourceId: "profile:name", quote: "Jordan" }];

const emailFromModel = {
  type: "EMAIL" as const,
  subject: "Introduction",
  greeting: "Hello Ashley,",
  paragraphs: [
    { id: "p1", text: "Email paragraph.", supports: support },
    { id: "p2", text: "Second email paragraph.", supports: support },
  ],
  signoff: "Thanks",
  signerName: "Alex Chen",
};

const noteFromModel = {
  type: "LINKEDIN_CONNECTION_NOTE" as const,
  greeting: "Hello Ashley,",
  body: { id: "b1", text: "Note paragraph.", supports: support },
};

const inmailFromModel = {
  type: "LINKEDIN_INMAIL" as const,
  subject: "Role",
  greeting: "Hello Ashley,",
  paragraphs: [
    { id: "p1", text: "InMail paragraph.", supports: support },
    { id: "p2", text: "Second InMail paragraph.", supports: support },
  ],
};

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(file: string, name: string): string {
  const text = source(file);
  const start = text.indexOf(`export async function ${name}`);
  const next = text.indexOf("\nexport ", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("outreach generate end to end", () => {
  it("stores a plain receipt and a later attempt reuses it with no second provider call", async () => {
    const { executePaidStructuredCall } = await import("@/lib/ai/paid-call-gate");
    const provider = vi.fn(async () => emailFromModel);
    const first = await executePaidStructuredCall({
      organizationId: "org",
      operation: "OUTREACH_ASSET",
      subjectKey: "cmux4btmv0005p32prkebgtka:EMAIL:persona:contact:PROACTIVE",
      inputFingerprint: "hash-1",
      isResultUsable: (stored) => stored.type === "EMAIL",
      parseStored: (json) => emailAssetContentSchema.parse(json),
      callProvider: provider,
    });
    expect(first.skipped).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(paidCallResultJson({ kept: "yes", unused: undefined })).toEqual({
      kept: "yes",
    });

    const second = await executePaidStructuredCall({
      organizationId: "org",
      operation: "OUTREACH_ASSET",
      subjectKey: "cmux4btmv0005p32prkebgtka:EMAIL:persona:contact:PROACTIVE",
      inputFingerprint: "hash-1",
      isResultUsable: (stored) => stored.type === "EMAIL",
      parseStored: (json) => emailAssetContentSchema.parse(json),
      callProvider: provider,
    });
    expect(second.skipped).toBe(true);
    expect(second.data.type).toBe("EMAIL");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("shows a saved email, LinkedIn note, and InMail from the parsed model result", () => {
    const email = emailAssetContentSchema.parse(paidCallResultJson(emailFromModel));
    const note = linkedinNoteAssetContentSchema.parse(paidCallResultJson(noteFromModel));
    const inmail = linkedinInmailAssetContentSchema.parse(paidCallResultJson(inmailFromModel));
    expect(composeOutreachText(email).body).toContain("Email paragraph.");
    expect(composeOutreachText(note).body).toContain("Note paragraph.");
    expect(composeOutreachText(inmail).body).toContain("InMail paragraph.");
    expect(composeOutreachText(inmail).subject).toBe("Role");
  });

  it("makes one model call and returns the plain failure when the save after the call fails", () => {
    const outreach = source("src/lib/application-assets/outreach.ts");
    const generate = outreach.slice(outreach.indexOf("export async function generateOutreachAsset"));
    expect(generate).not.toMatch(/for \(let attempt = 0; attempt < 2/);
    expect(generate).toContain("outreach_save_failed");
    expect(generate).toContain("OUTREACH_GENERATION_FAILURE_MESSAGE");
    expect(generate).toContain("paidCallResultJson");
    expect(isRetryableProviderMessage(OUTREACH_GENERATION_FAILURE_MESSAGE)).toBe(false);
    const fail = source("src/lib/application-jobs/service.ts");
    expect(fail).toContain("isRetryableProviderMessage(input.message)");
    const retry = functionBody("src/lib/application-jobs/service.ts", "retryApplicationJob");
    expect(retry).toContain('status: "PENDING"');
    expect(retry).not.toContain("runPaidStructuredCall");
    expect(retry).not.toContain("generateOutreachWithModel");
  });

  it("polls only while a job is queued or running and those reads do not enqueue or pay", () => {
    const live = source("src/components/ApplicationWorkspaceLive.tsx");
    expect(live).toContain("return latest.active");
    expect(live).toContain("initialWorkRunning");
    const tracker = source("src/components/ApplicationSidebarTracker.tsx");
    expect(tracker).toContain("step.hasActiveJob");
    expect(tracker).toContain("activeWorkspaceJobs(liveJobs)");
    const workspace = functionBody(
      "src/app/actions/application-jobs.ts",
      "getApplicationWorkspaceLiveAction",
    );
    const statuses = functionBody(
      "src/app/actions/application-jobs.ts",
      "readApplicationJobStatusesAction",
    );
    const trackerAction = functionBody(
      "src/app/actions/application-jobs.ts",
      "getApplicationTrackerAction",
    );
    for (const body of [workspace, statuses, trackerAction]) {
      expect(body).not.toContain("enqueueApplicationJob");
      expect(body).not.toContain("runPaidStructuredCall");
      expect(body).not.toContain("generateStructured");
    }
    expect(
      activeWorkspaceJobs([
        {
          id: "done",
          type: "OUTREACH",
          status: "FAILED",
          targetId: null,
          error: OUTREACH_GENERATION_FAILURE_MESSAGE,
          canRetry: true,
          progressText: "",
          waitKind: "stayAndWatch",
          sectionId: "outreach",
          readyText: "",
        },
      ]),
    ).toEqual([]);
  });

  it("shows the writing spinner only while the selected person's job is queued or running", () => {
    const contactId = "contact-ashley";
    const targetId = "EMAIL:persona:contact-ashley:PROACTIVE";
    const running = {
      id: "job-1",
      type: "OUTREACH",
      status: "IN_PROGRESS" as const,
      targetId,
    };
    expect(
      outreachWritingForContact({
        jobs: [running],
        contactId,
        personaId: "persona",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
      }),
    ).toBe(true);
    expect(
      outreachWritingForContact({
        jobs: [{ ...running, status: "PENDING" }],
        contactId,
        personaId: "persona",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
      }),
    ).toBe(true);
    expect(
      outreachWritingForContact({
        jobs: [{ ...running, status: "COMPLETED" }],
        contactId,
        personaId: "persona",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
        pendingJobId: "job-1",
      }),
    ).toBe(false);
    expect(
      outreachWritingForContact({
        jobs: [{ ...running, status: "FAILED" }],
        contactId,
        personaId: "persona",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
        pendingJobId: "job-1",
      }),
    ).toBe(false);
    expect(
      outreachWritingForContact({
        jobs: [{ ...running, targetId: "EMAIL:persona:someone-else:PROACTIVE" }],
        contactId,
        personaId: "persona",
        assetType: "EMAIL",
        purpose: "PROACTIVE",
      }),
    ).toBe(false);

    const section = source("src/components/ApplicationOutreachSections.tsx");
    expect(section).toContain('data-testid="outreach-writing"');
    expect(section).toContain("outreachConfig.labels.writingMessage");
    expect(outreachConfig.labels.writingMessage).toBe(
      "Writing your message… this can take about a minute.",
    );
    const status = source("src/components/InlineActionStatus.tsx");
    expect(status).toContain("if (suppressJobFailure) return null");
    const body = source("src/components/ApplicationOutreachBody.tsx");
    expect(body.match(/<WorkspaceProgress/g)?.length).toBe(1);
    const progress = source("src/components/ApplicationWorkspaceLive.tsx");
    expect(progress).toContain("retryApplicationJobAction");
  });
});
