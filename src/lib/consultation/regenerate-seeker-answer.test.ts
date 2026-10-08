// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/campaigns/camp/consultation",
  useSearchParams: () => new URLSearchParams(),
}));

import { CheatSheetCoachItems } from "@/components/CheatSheetCoachItems";
import { ResultActions, ResultBody } from "@/components/ConsultationThread";
import { HarperDraftProvider } from "@/components/HarperDraftStore";
import type { ConsultationQaItem } from "@/lib/consultation/qa-view";
import {
  draftRegenerationAnswer,
  withSeekerEditedGrounding,
} from "@/lib/consultation/answer-binding";
import type { QaStatement } from "@/lib/consultation/qa-view";
import {
  ENTERPRISE_SALES_DIRECTOR_POSTING,
  NURSE_MANAGER_POSTING,
} from "@/lib/job-requirement/fixtures";
import { polishCopy } from "@/lib/product-config";

const SALES_ANSWER =
  "At Acme Data Systems I built a repeatable enterprise sales motion and coached account executives. Forecast accuracy improved without adding a new employer.";
const NURSING_ANSWER =
  "At Riverside Community Hospital I staffed the medical-surgical floor and reviewed incident reports with the charge nurses.";
const NEW_GRADUATE_ANSWER =
  "In my senior internship I staffed a campus clinic two evenings a week and wrote the handoff notes the charge nurse used the next morning.";

function statement(partial: Partial<QaStatement> & Pick<QaStatement, "id" | "content">): QaStatement {
  return {
    turnId: "turn-1",
    kind: "INTERVIEW_ANSWER",
    status: "DRAFT",
    strengtheningNote: null,
    keyPoints: ["Login VSI added $20MM."],
    ...partial,
  };
}

describe("regenerate uses the seeker's draft when they wrote it", () => {
  it("sends the seeker's sales, nursing, and new-graduate answers, and keeps a Harper draft on the old path", () => {
    expect(ENTERPRISE_SALES_DIRECTOR_POSTING).toContain("Acme Data Systems");
    expect(NURSE_MANAGER_POSTING).toContain("Riverside Community Hospital");
    for (const answer of [SALES_ANSWER, NURSING_ANSWER, NEW_GRADUATE_ANSWER]) {
      expect(
        draftRegenerationAnswer({
          seekerEdited: true,
          content: answer,
          turnBody: "Tell me about a situation where another team saw the customer differently.",
          answerContext: "Login VSI moved from SMB to enterprise and added $20MM.",
        }),
      ).toBe(answer);
    }
    expect(
      draftRegenerationAnswer({
        seekerEdited: false,
        content: SALES_ANSWER,
        turnBody: "Tell me about a situation where another team saw the customer differently.",
        answerContext: "Login VSI moved from SMB to enterprise and added $20MM.",
      }),
    ).toBe("Login VSI moved from SMB to enterprise and added $20MM.");
    expect(
      draftRegenerationAnswer({
        seekerEdited: false,
        content: NURSING_ANSWER,
        turnBody: NURSE_MANAGER_POSTING,
        answerContext: null,
      }),
    ).toBe(NURSE_MANAGER_POSTING);

    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const regenerate = service.slice(
      service.indexOf("export async function regenerateConsultationStatement"),
      service.indexOf("export async function approvalContinuesHarperPlanning"),
    );
    expect(regenerate).toContain("extractAnswerWithQuality");
    expect(regenerate).toContain("polishAnswerWithQuality");
    expect(regenerate).toContain("profileItems: []");
    expect(regenerate).toContain('"statement_regeneration"');
    expect(regenerate).toContain("draftRegenerationAnswer");
  });

  it("stores key points from the edited answer and keeps the seeker flag", () => {
    const stored = withSeekerEditedGrounding(
      { answerFramework: "CAR", keyPoints: ["Login VSI added $20MM."] },
      ["OpenText VRA pipeline was $2.9MM.", "The permanent fix shipped in 45 days."],
    );
    expect(stored.seekerEdited).toBe(true);
    expect(stored.keyPoints).toEqual([
      "OpenText VRA pipeline was $2.9MM.",
      "The permanent fix shipped in 45 days.",
    ]);
    expect(stored.keyPoints).not.toContain("Login VSI added $20MM.");
  });
});

describe("key points edit with the answer", () => {
  it("shows an editable key-point field and saves the seeker's points", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    let saved = "";
    act(() => {
      root.render(
        createElement(ResultBody, {
          statement: statement({ id: "st-1", content: SALES_ANSWER }),
          editing: true,
          value: SALES_ANSWER,
          keyPointsValue: "Login VSI added $20MM.",
          onKeyPointsChange: (_id, value) => {
            saved = value;
          },
        }),
      );
    });
    const field = host.querySelector(
      "[data-testid='consultation-key-points-editor-st-1']",
    ) as HTMLTextAreaElement | null;
    expect(field).toBeTruthy();
    expect(field?.value).toBe("Login VSI added $20MM.");
    expect(field?.getAttribute("aria-label")).toBe(polishCopy.keyPoints);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(field, "Acme forecast accuracy improved.");
      field?.dispatchEvent(new Event("input", { bubbles: true }));
      field?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(saved).toBe("Acme forecast accuracy improved.");
    act(() => {
      root.unmount();
    });
    host.remove();

    const thread = readFileSync("src/components/ConsultationThread.tsx", "utf8");
    expect(thread).toContain("name={`keyPoints:${statement.id}`}");
    const actions = readFileSync("src/app/actions/consultation.ts", "utf8");
    expect(actions).toContain("keyPoints:");
    expect(actions).toContain("polishCopy.statementUnchanged");
    expect(actions).toContain("polishCopy.statementRegenerated");
  });
});

describe("Regenerate button label", () => {
  it("says Polish my answer on a seeker-owned draft and Regenerate on a Harper draft", () => {
    expect(polishCopy.polishMyAnswer).toBe("Polish my answer");
    expect(polishCopy.regenerate).toBe("Regenerate");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    function render(owned: boolean, content: string) {
      act(() => {
        root.render(
          createElement(ResultActions, {
            campaignId: "camp",
            testId: "consultation-result-q1",
            statements: [
              statement({
                id: "st-1",
                content,
                groundingJson: owned
                  ? { seekerEdited: true, keyPoints: ["OpenText pipeline was $2.9MM."] }
                  : { keyPoints: ["Harper drafted this."] },
              }),
            ],
          }),
        );
      });
    }
    function label(): string {
      const form = host.querySelector(
        "[data-testid='consultation-result-q1-regenerate']",
      );
      return form?.querySelector("button")?.textContent ?? "";
    }
    render(false, SALES_ANSWER);
    expect(label()).toBe(polishCopy.regenerate);
    render(true, NURSING_ANSWER);
    expect(label()).toBe(polishCopy.polishMyAnswer);
    render(true, NEW_GRADUATE_ANSWER);
    expect(label()).toBe(polishCopy.polishMyAnswer);
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("uses that label on Interview Preparation Guides sample drafts", () => {
    const owned = statement({
      id: "st-owned",
      content: NURSING_ANSWER,
      groundingJson: { seekerEdited: true, keyPoints: ["Riverside staffed the floor."] },
    });
    const harper = statement({
      id: "st-harper",
      content: NEW_GRADUATE_ANSWER,
      groundingJson: { keyPoints: ["Harper drafted the internship."] },
    });
    function guideQa(id: string, question: string, draft: QaStatement): ConsultationQaItem {
      return {
        questionTurnId: `turn-${id}`,
        targetKey: `cheatSheet:${id}`,
        question,
        followUp: null,
        seekerAnswers: [],
        statements: [draft],
        resumeBullet: null,
        talkingPoint: draft,
        pendingDraftTalkingPoint: null,
        pendingDraftResumeBullet: null,
        ignored: false,
        needsMoreDetail: false,
      };
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(
          HarperDraftProvider,
          null,
          createElement(CheatSheetCoachItems, {
            campaignId: "camp",
            canEdit: true,
            items: [
              {
                id: "contact:c-1:likely:1",
                prompt: "Tell me about an enterprise sales motion.",
                sampleAnswer: SALES_ANSWER,
                harperQuestion: null,
                supports: [],
              },
              {
                id: "contact:c-1:likely:2",
                prompt: "Tell me about staffing a hospital floor.",
                sampleAnswer: NURSING_ANSWER,
                harperQuestion: null,
                supports: [],
              },
              {
                id: "contact:c-1:likely:3",
                prompt: "Tell me about your internship.",
                sampleAnswer: NEW_GRADUATE_ANSWER,
                harperQuestion: null,
                supports: [],
              },
            ],
            qaItems: [
              guideQa("contact:c-1:likely:2", "Tell me about staffing a hospital floor.", owned),
              guideQa("contact:c-1:likely:3", "Tell me about your internship.", harper),
            ],
          }),
        ),
      );
    });
    function buttonText(testId: string): string {
      const form = host.querySelector(`[data-testid='${testId}']`);
      return form?.querySelector("button")?.textContent ?? "";
    }
    expect(buttonText("cheat-sheet-sample-regenerate-contact:c-1:likely:1")).toBe(
      polishCopy.regenerate,
    );
    expect(buttonText("consultation-result-turn-contact:c-1:likely:2-regenerate")).toBe(
      polishCopy.polishMyAnswer,
    );
    expect(buttonText("consultation-result-turn-contact:c-1:likely:3-regenerate")).toBe(
      polishCopy.regenerate,
    );
    const service = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const save = service.slice(
      service.indexOf("export async function saveCheatSheetSampleDraft"),
      service.indexOf("export async function resolveApplicationSummaryFlag"),
    );
    expect(save).toContain("saveEditedConsultationStatement");
    expect(save).not.toContain("seekerEdited:");
    const regenerate = service.slice(
      service.indexOf("export async function regenerateCheatSheetSampleAnswer"),
      service.indexOf("export async function saveCheatSheetSampleDraft"),
    );
    expect(regenerate).toContain("saveCheatSheetSampleDraft");
    expect(regenerate).toContain("regenerateConsultationStatement");
    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
