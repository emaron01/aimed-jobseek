// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/campaigns/camp_1/consultation",
}));

import { ConsultationStanding } from "@/components/ConsultationStanding";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import type { StandingListEntry } from "@/lib/consultation/standing-entries";

const scrollIntoView = vi.fn();

function question(questionTurnId: string, targetKey: string, text: string): ConsultationQaItem {
  return {
    questionTurnId,
    targetKey,
    question: text,
    followUp: null,
    seekerAnswers: [],
    statements: [],
    resumeBullet: null,
    talkingPoint: null,
    pendingDraftTalkingPoint: null,
    pendingDraftResumeBullet: null,
    ignored: false,
  };
}

function entry(patch: Partial<StandingListEntry> & Pick<StandingListEntry, "id" | "targetKey" | "label">): StandingListEntry {
  return {
    mergedTargetKeys: [patch.targetKey],
    strength: "NONE",
    kind: "REQUIRED",
    explanation: null,
    experience: null,
    facts: [],
    questions: [],
    showShareForm: false,
    ...patch,
  };
}

const entries: StandingListEntry[] = [
  entry({
    id: "gap",
    targetKey: "required:forecast",
    label: "Forecast discipline",
    questions: [
      question(
        "q-gap",
        "required:forecast",
        "Which leading and lagging indicators would you use?",
      ),
    ],
  }),
];

function tree(): ReactNode {
  return createElement(
    HarperDraftProvider,
    null,
    createElement(ConsultationStanding, {
      campaignId: "camp_1",
      canEdit: true,
      acceptingReplies: true,
      sessionStatus: "IN_PROGRESS",
      jobsActive: false,
      overall: "You are close on the forecast.",
      jobTitle: "Senior Director of Sales",
      entries,
    }),
  );
}

describe("Harper sections start collapsed", () => {
  let root: Root;
  let host: HTMLDivElement;

  afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    scrollIntoView.mockClear();
    window.history.replaceState(null, "", "/campaigns/camp_1/consultation");
  });

  function mount() {
    Element.prototype.scrollIntoView = scrollIntoView;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root.render(tree());
    });
  }

  it("renders the three headings collapsed, with the intro and Ask Harper outside them", () => {
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    const ask = section.indexOf("<AskHarperBox");
    const intro = section.indexOf('data-testid="harper-page-intro"');
    const standing = section.indexOf("<ConsultationStanding");
    expect(ask).toBeGreaterThan(-1);
    expect(intro).toBeGreaterThan(ask);
    expect(standing).toBeGreaterThan(intro);

    window.history.replaceState(null, "", "/campaigns/camp_1/consultation");
    mount();
    const details = [...host.querySelectorAll("details")].filter((item) =>
      item.hasAttribute("data-harper-section"),
    );
    expect(details).toHaveLength(3);
    for (const item of details) {
      expect(item.open).toBe(false);
      expect(item.querySelector("summary")?.textContent).toMatch(/\S/);
    }
    const counts = host.querySelector('[data-testid="consultation-standing-counts"]');
    const summary = host.querySelector('[data-testid="harper-section-standing-heading"]');
    expect(summary?.contains(counts)).toBe(true);
    expect(host.querySelector('[data-testid="harper-section-standing-body"]')).toBeTruthy();
  });

  it("opens the section for a question link and shows that question", () => {
    window.history.replaceState(
      null,
      "",
      "/campaigns/camp_1/consultation#harper-q%3Aq-gap",
    );
    mount();
    const standing = host.querySelector(
      '[data-harper-section="where-you-stand"]',
    ) as HTMLDetailsElement;
    expect(standing.open).toBe(true);
    const questionEl = host.querySelector("#harper-q\\:q-gap");
    expect(standing.contains(questionEl)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("toggles a section without scrolling, and keeps it open across a refresh", () => {
    window.history.replaceState(null, "", "/campaigns/camp_1/consultation");
    mount();
    const standing = host.querySelector(
      '[data-harper-section="where-you-stand"]',
    ) as HTMLDetailsElement;
    const heading = host.querySelector(
      '[data-testid="harper-section-standing-heading"]',
    ) as HTMLElement;
    act(() => {
      heading.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(standing.open).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();
    act(() => {
      root.render(tree());
    });
    const again = host.querySelector(
      '[data-harper-section="where-you-stand"]',
    ) as HTMLDetailsElement;
    expect(again.open).toBe(true);
    const standingSource = readFileSync("src/components/ConsultationStanding.tsx", "utf8");
    expect(standingSource).toContain("setPendingTarget(replyKey)");
    expect(standingSource).not.toMatch(/onSubmitStart[\s\S]{0,180}setOpenSections/);
  });
});
