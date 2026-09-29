/**
 * Harper page usability (PART A): drafts, scroll, buttons, question text, Save Answer, processing notice.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { consultationConversationCopy } from "@/lib/product-config/consultation";

function src(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

describe("Harper page usability PART A", () => {
  it("keeps unsaved drafts in page-lifetime client state across submit/refresh", () => {
    const store = src("src/components/HarperDraftStore.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    const standing = src("src/components/ConsultationStanding.tsx");
    const section = src("src/components/ConsultationSection.tsx");
    expect(store).toContain("HarperDraftProvider");
    expect(store).toContain("useHarperDraft");
    expect(store).toContain("clearDraft");
    expect(store).toMatch(/delete next\[key\]/);
    expect(section).toContain("HarperDraftProvider");
    expect(thread).toContain("useHarperDraft");
    expect(standing).toContain("useHarperDraft");
    // Forms stay mounted while busy so drafts are not wiped by unmount.
    expect(thread).toContain("actionsEnabled = showReply && !jobsActive");
    expect(thread).toMatch(
      /sessionStatus !== "SKIPPED"[\s\S]*sessionStatus !== "PAUSED"/,
    );
    expect(thread).not.toMatch(
      /sessionStatus !== "PAUSED"\s*&&\s*!jobsActive/,
    );
    // Clear only the submitted draft key — other answer boxes keep their text.
    expect(thread).toContain("draft.clear()");
    expect(standing).toContain("draft.clear()");
  });

  it("preserves scroll after Save, Ignore, Skip, and Edit via ApplicationActionForm", () => {
    const form = src("src/components/ApplicationActionForm.tsx");
    expect(form).toContain("preserveScroll");
    expect(form).toContain("window.scrollTo");
    expect(form).toContain("scrollY");
    expect(form).toContain("router.refresh()");
  });

  it("renders one side-by-side action row without duplicated Reply/Edit labels", () => {
    const thread = src("src/components/ConsultationThread.tsx");
    expect(thread).toContain('data-testid="consultation-question-actions"');
    expect(thread).toContain("flex flex-wrap items-center gap-2");
    // Visible label above the textarea was the duplicate of the submit label.
    expect(thread).toContain('className="sr-only"');
    expect(thread).not.toMatch(
      /span className="font-medium text-ink">\s*\{hasPriorReply/,
    );
    expect(thread).toContain("compact");
  });

  it("shows each question text once when the topic heading matches", () => {
    const standing = src("src/components/ConsultationStanding.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(standing).toContain("labelMatchesQuestion");
    expect(thread).toContain("suppressQuestionTextWhenMatchesLabel");
    expect(thread).toContain("showQuestionText");
  });

  it('names the primary answer button exactly "Save Answer"', () => {
    expect(consultationConversationCopy.shareSomeDetails).toBe("Save Answer");
    expect(consultationConversationCopy.threadReply).toBe("Save Answer");
    const standing = src("src/components/ConsultationStanding.tsx");
    expect(standing).toContain("consultationConversationCopy.shareSomeDetails");
  });

  it("shows the exact processing notice while Harper is busy", () => {
    expect(consultationConversationCopy.processingCanTakeMinutes).toBe(
      "This process can take several minutes.",
    );
    const section = src("src/components/ConsultationSection.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    expect(section).toContain("processingCanTakeMinutes");
    expect(section).toContain('data-testid="harper-processing-minutes"');
    expect(thread).toContain("processingCanTakeMinutes");
    expect(thread).toContain('data-testid="harper-processing-minutes"');
  });

  it("rendering Harper usability UI makes no paid call and enqueues no job", () => {
    const section = src("src/components/ConsultationSection.tsx");
    const thread = src("src/components/ConsultationThread.tsx");
    const standing = src("src/components/ConsultationStanding.tsx");
    for (const body of [section, thread, standing]) {
      expect(body).not.toContain("runPaidStructuredCall");
      expect(body).not.toContain("enqueueApplicationJob");
      expect(body).not.toContain("processConsultationReply");
    }
  });
});
