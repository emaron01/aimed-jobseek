// @vitest-environment happy-dom
/**
 * Batch A: one card, one reply path, hidden evidence, cheat-sheet row, no jump.
 * Fixtures: a sales draft, a nursing question with no draft, a new-graduate approval.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/consultation",
  useSearchParams: () => new URLSearchParams(),
}));

import { HarperDraftProvider } from "@/components/HarperDraftStore";
import { QuestionList } from "@/components/ConsultationThread";
import type { ConsultationQaItem, QaStatement } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config/consultation";
import { polishCopy } from "@/lib/product-config/polish";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function statement(id: string, status: "DRAFT" | "APPROVED", content: string): QaStatement {
  return {
    id,
    turnId: id,
    kind: "INTERVIEW_ANSWER",
    status,
    content,
    strengtheningNote: null,
  };
}

function card(input: {
  id: string;
  question: string;
  targetKey: string;
  talkingPoint?: QaStatement | null;
}): ConsultationQaItem {
  return {
    questionTurnId: input.id,
    targetKey: input.targetKey,
    question: input.question,
    followUp: null,
    seekerAnswers: [],
    statements: input.talkingPoint ? [input.talkingPoint] : [],
    resumeBullet: null,
    talkingPoint: input.talkingPoint ?? null,
    ignored: false,
  };
}

const salesDraft = card({
  id: "q-sales",
  targetKey: "required:forecast",
  question: "Where did the forecast accuracy come from?",
  talkingPoint: statement(
    "st-sales",
    "DRAFT",
    "I rebuilt the Monday forecast review and named slip risk out loud.",
  ),
});

const nursingOpen = card({
  id: "q-nursing",
  targetKey: "required:assist",
  question: "When have you been the surgical first assist?",
});

const graduateApproved = card({
  id: "q-grad",
  targetKey: "required:teaching",
  question: "What did you teach during your student placement?",
  talkingPoint: statement(
    "st-grad",
    "APPROVED",
    "I taught a fourth-grade reading group during my student placement.",
  ),
});

describe("Harper spec batch A cards", () => {
  it("hides evidence, borders each requirement, and keeps the share box off a questioned row", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(standing).not.toContain("expandEvidence");
    expect(standing).not.toContain("toggle-evidence-");
    expect(standing).toContain("border-2 border-edge-strong bg-surface");
    expect(standing).toContain("border border-edge bg-canvas");
    expect(standing).toContain("entry.questions.length === 0");
    expect(standing).toContain("GapShareDetailsForm");
    const shareAt = standing.indexOf("entry.questions.length === 0");
    expect(shareAt).toBeGreaterThan(-1);
    expect(standing.indexOf("GapShareDetailsForm", shareAt)).toBeGreaterThan(shareAt);
  });

  it("shows one reply box before a draft, and Edit Approve Regenerate once an answer is showing", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(HarperDraftProvider, {
          children: createElement(QuestionList, {
            campaignId: "camp",
            canEdit: true,
            questions: [salesDraft, nursingOpen, graduateApproved],
            showReply: true,
            pendingTarget: null,
            jobsActive: false,
            collapseWhenApproved: true,
            onSubmitStart: () => undefined,
          }),
        }),
      );
    });

    const sales = host.querySelector("[data-harper-question='q-sales']");
    const nursing = host.querySelector("[data-harper-question='q-nursing']");
    const graduate = host.querySelector("[data-harper-question='q-grad']");
    expect(sales?.textContent).toContain(salesDraft.question);
    expect(sales?.querySelector("[data-testid=consultation-reply-box]")).toBeNull();
    expect(sales?.textContent).toContain(consultationConversationCopy.approve);
    expect(sales?.textContent).toContain(polishCopy.regenerate);
    expect(sales?.textContent).toContain(consultationConversationCopy.editAnswer);
    expect(sales?.className).toContain("border-2");
    expect(sales?.className).toContain("border-edge-strong");
    expect(sales?.className).toContain("bg-surface");
    const salesRow = sales?.querySelector("[data-testid=consultation-result-q-sales]");
    expect(salesRow?.className).toContain("sm:flex-nowrap");
    expect(salesRow?.textContent).toContain(consultationConversationCopy.approve);
    expect(salesRow?.textContent).toContain(consultationConversationCopy.skipQuestion);
    expect(salesRow?.textContent).toContain(consultationConversationCopy.ignoreQuestion);
    expect(consultationConversationCopy.ignoreQuestion).toBe("Permanently Ignore");
    expect(sales?.querySelector("[data-testid=consultation-secondary-actions]")).toBeNull();
    expect(sales?.querySelector("[data-testid=consultation-reply-box]")).toBeNull();

    expect(nursing?.className).toContain("bg-surface");
    expect(nursing?.className).toContain("border-2");
    const nursingRow = nursing?.querySelector("[data-testid=consultation-question-actions]");
    expect(nursingRow?.className).toContain("sm:flex-nowrap");
    expect(nursingRow?.textContent).toContain(consultationConversationCopy.threadReply);
    expect(nursingRow?.textContent).toContain(consultationConversationCopy.ignoreQuestion);
    const replyBox = nursing?.querySelector("[data-testid=consultation-reply-box]");
    expect(replyBox).toBeTruthy();
    expect(replyBox?.className).toContain("border");
    expect(replyBox?.className).toContain("border-edge-strong");
    expect(replyBox?.className).not.toContain("border-2");

    expect(graduate?.textContent).toContain(graduateApproved.question);
    expect(graduate?.querySelector("[data-testid=consultation-reply-box]")).toBeNull();
    expect(graduate?.textContent).toContain("Approved");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("uses the Harper action row for a cheat-sheet sample and keeps place when a job finishes", () => {
    const sheet = src("src/components/CheatSheetCoachItems.tsx");
    expect(sheet).toContain("flex flex-wrap items-center gap-2 sm:flex-nowrap");
    expect(sheet).toContain("border-2 border-edge-strong bg-surface");
    expect(sheet).toContain("polishCopy.regenerate");
    expect(sheet).toContain("consultationConversationCopy.approve");
    expect(sheet).toContain("consultationConversationCopy.editAnswer");
    expect(sheet).toContain("regenerateCheatSheetSampleAction");
    expect(sheet).not.toContain("<details");
    expect(sheet).toContain("!sampleStatement");

    const live = src("src/components/HarperLiveStatus.tsx");
    const refreshAt = live.indexOf("router.refresh()");
    const keepAt = live.indexOf("keepHarperQuestionInPlace(card)");
    expect(keepAt).toBeGreaterThan(-1);
    expect(keepAt).toBeLessThan(refreshAt);
  });
});
