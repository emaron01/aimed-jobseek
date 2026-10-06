// @vitest-environment happy-dom
/**
 * Green coaching button placement, and Ask Harper stays disabled until
 * Harper has asked a question.
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
import { AskHarperBox } from "@/components/AskHarperBox";
import { harperHasAskedQuestion } from "@/lib/consultation/qa-view";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

describe("Harper start button and Ask Harper availability", () => {
  it("places the green coaching button above Ask Harper and keeps the start action", () => {
    expect(consultationConversationCopy.prepareCoaching).toBe(
      "Click Here to Start Harper's Coaching Against the Job Requirements",
    );
    const section = src("src/components/ConsultationSection.tsx");
    const buttonAt = section.indexOf("consultationConversationCopy.prepareCoaching");
    const askAt = section.indexOf("<AskHarperBox");
    expect(buttonAt).toBeGreaterThan(-1);
    expect(buttonAt).toBeLessThan(askAt);
    const gate = section.slice(
      section.indexOf("{canEdit && !session && !consultationBusy ? ("),
      buttonAt,
    );
    expect(gate).toContain("canEdit && !session && !consultationBusy");
    expect(section).toContain("action={startConsultationAction}");
    expect(section).toContain('variant="success"');
    expect(section).toContain('testId="start-consultation"');
    const button = src("src/components/AppButton.tsx");
    const success = button.slice(button.indexOf("success:"), button.indexOf("chip:"));
    expect(success).toContain("bg-success");
    expect(success).toContain("text-on-ink");
    expect(success).toContain("cursor-pointer");
    expect(success).toContain("hover:bg-success-tint");
    expect(success).toContain("focus-visible:bg-success-tint");
    expect(success).toContain("hover:text-success");
    expect(success).toContain("focus-visible:text-success");
    const skipAt = section.indexOf('submitLabel="Skip consultation"');
    const hideAt = section.lastIndexOf('className="hidden"', skipAt);
    expect(skipAt).toBeGreaterThan(-1);
    expect(hideAt).toBeGreaterThan(-1);
    expect(skipAt - hideAt).toBeLessThan(500);
    expect(section).toContain("skipConsultationAction");
    expect(src("src/app/actions/consultation.ts")).toContain(
      "export async function skipConsultationAction",
    );
    expect(src("src/lib/consultation/service.ts")).toContain(
      "export async function skipConsultation",
    );
  });

  it("treats a consultant question as Harper having asked, and ignores notes", () => {
    expect(
      harperHasAskedQuestion([
        { speaker: "CONSULTANT", followUp: false, intent: null },
      ]),
    ).toBe(true);
    expect(
      harperHasAskedQuestion([
        { speaker: "CONSULTANT", followUp: false, intent: "CLOSING" },
        { speaker: "CONSULTANT", followUp: true, intent: null },
        { speaker: "SEEKER", followUp: false, intent: null },
      ]),
    ).toBe(false);
  });

  it("disables Ask Harper until a question exists, then keeps the orange button active", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => {
      root.render(
        createElement(AskHarperBox, {
          campaignId: "camp",
          canEdit: true,
          drafts: [],
          hasQuestion: false,
        }),
      );
    });
    const disabled = host.querySelector<HTMLButtonElement>("[data-testid=ask-harper-open]");
    expect(disabled?.textContent).toBe(consultationConversationCopy.askHarperAction);
    expect(disabled?.disabled).toBe(true);
    expect(disabled?.className).toContain("bg-bright-orange");
    expect(disabled?.className).toContain("disabled:bg-edge-strong");
    await act(async () => {
      disabled?.click();
    });
    expect(host.querySelector("[data-testid=ask-harper-question]")).toBeNull();

    await act(async () => {
      root.render(
        createElement(AskHarperBox, {
          campaignId: "camp",
          canEdit: true,
          drafts: [],
          hasQuestion: true,
        }),
      );
    });
    const enabled = host.querySelector<HTMLButtonElement>("[data-testid=ask-harper-open]");
    expect(enabled?.disabled).toBe(false);
    await act(async () => {
      enabled?.click();
    });
    expect(host.querySelector("[data-testid=ask-harper-question]")).toBeTruthy();

    const notes = src("src/components/InterviewStagesSection.tsx");
    const sheet = src("src/app/(app)/campaigns/[id]/summary/page.tsx");
    const harper = src("src/components/ConsultationSection.tsx");
    for (const file of [notes, sheet, harper]) {
      expect(file).toContain("hasQuestion=");
    }
    expect(notes).toContain("applicationHasHarperQuestion");
    expect(sheet).toContain("applicationHasHarperQuestion");
    expect(harper).toContain("harperHasAskedQuestion(threadTurns)");
    const lookup = src("src/lib/consultation/ask-harper.ts");
    const fn = lookup.slice(
      lookup.indexOf("export async function applicationHasHarperQuestion"),
      lookup.indexOf("export async function loadAskHarperDrafts"),
    );
    expect(fn).toContain("harperHasAskedQuestion");
    expect(fn).not.toContain("enqueueApplicationJob");
    expect(fn).not.toContain("runPaidStructuredCall");

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
