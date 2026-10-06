// @vitest-environment happy-dom
/**
 * Edit and Save keep the seeker at the question. Replies and approvals already
 * restore scroll from ApplicationActionForm; draft Edit removes the focused
 * button, and Save closes the editor, which otherwise jumps to the top.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { keepHarperQuestionInPlace } from "@/components/ApplicationActionForm";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

describe("draft edit and save keep the question in place", () => {
  it("moves focus onto the question and restores the scroll position", async () => {
    let y = 0;
    window.scrollTo = ((x: number, nextY?: number) => {
      void x;
      y = nextY ?? 0;
    }) as typeof window.scrollTo;
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => y,
    });

    const card = document.createElement("article");
    card.dataset.harperQuestion = "q-draft";
    card.id = "harper-q:q-draft";
    const button = document.createElement("button");
    button.textContent = "Edit";
    card.append(button);
    document.body.append(card);
    button.focus();
    window.scrollTo(0, 640);

    keepHarperQuestionInPlace(button);
    expect(document.activeElement).toBe(card);
    expect(window.scrollY).toBe(640);

    button.remove();
    window.scrollTo(0, 0);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 60));
    expect(window.scrollY).toBe(640);
    expect(document.activeElement).toBe(card);
    card.remove();
  });

  it("uses that restore for Edit and for Save before the editor closes", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    const editAt = thread.indexOf('data-testid={`${testId}-edit`}');
    const editHandler = thread.slice(editAt, thread.indexOf("consultationConversationCopy.editAnswer", editAt));
    expect(editHandler.indexOf("keepHarperQuestionInPlace(event.currentTarget)")).toBeGreaterThan(-1);
    expect(editHandler.indexOf("keepHarperQuestionInPlace(event.currentTarget)")).toBeLessThan(
      editHandler.indexOf("startEdit()"),
    );

    const form = src("src/components/ApplicationActionForm.tsx");
    const saveOrder = form.indexOf("if (place) keepHarperQuestionInPlace(form, place);");
    expect(saveOrder).toBeGreaterThan(-1);
    expect(saveOrder).toBeLessThan(form.indexOf("onSuccess?.()", saveOrder));
    expect(thread).toContain("saveEditedConsultationStatementAction");
    expect(thread).toContain('tabIndex={-1}');

    const cheatSheet = src("src/components/CheatSheetCoachItems.tsx");
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(cheatSheet).toContain("<QuestionList");
    expect(standing).toContain("<QuestionList");
    expect(thread).not.toContain("enqueueApplicationJob");
    expect(thread).not.toContain("runPaidStructuredCall");
    expect(form).not.toContain("enqueueApplicationJob");
    expect(form).not.toContain("runPaidStructuredCall");
  });
});
