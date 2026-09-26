import { describe, expect, it } from "vitest";
import {
  LINKEDIN_SUBSTANCE_WORD_MIN,
  linkedInProfileHasSubstance,
} from "@/lib/application-summary/linkedin";
import {
  appendCheatSheetNote,
  parseCheatSheetNotes,
  peopleRequestedForGeneration,
  unusedPersonaSectionCount,
} from "@/lib/application-summary/notes";

const thin = "Recruiter at Acme. Hiring for sales.";
const substantial = Array.from({ length: LINKEDIN_SUBSTANCE_WORD_MIN }, (_, index) => {
  return index === 0
    ? "I lead enterprise recruiting at Northline and previously built a TA team."
    : "background";
}).join(" ");

describe("cheat sheet LinkedIn and on-demand generation", () => {
  it("treats a thin or missing profile as persona-only and a substantial profile as additive", () => {
    expect(linkedInProfileHasSubstance(null)).toBe(false);
    expect(linkedInProfileHasSubstance("")).toBe(false);
    expect(linkedInProfileHasSubstance(thin)).toBe(false);
    expect(linkedInProfileHasSubstance(substantial)).toBe(true);
  });

  it("stores stage information on the person's cheat sheet notes", () => {
    const notes = appendCheatSheetNote({
      existing: [],
      text: "Invitation: they want to hear about enterprise motion.",
      stageId: "stage-1",
    });
    expect(parseCheatSheetNotes(notes).map((note) => note.text)).toEqual([
      "Invitation: they want to hear about enterprise motion.",
    ]);
    expect(notes[0]?.stageId).toBe("stage-1");
  });

  it("generates only the requested section and counts unused persona sections", () => {
    const people = [
      { sectionKey: "contact:alex" },
      { sectionKey: "role:hm" },
      { sectionKey: "role:cs" },
    ];
    expect(
      peopleRequestedForGeneration({ people, sectionKey: "contact:alex" }),
    ).toEqual([{ sectionKey: "contact:alex" }]);
    expect(peopleRequestedForGeneration({ people, sectionKey: null })).toEqual([]);
    expect(
      unusedPersonaSectionCount({ personaCount: 3, generatedSectionCount: 1 }),
    ).toBe(2);
  });
});
