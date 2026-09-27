import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  harperCoachingVoiceViolations,
  seekerFirstName,
  seekerPrepInstructionViolations,
  talkTrackVoiceViolations,
} from "@/lib/consultation/voice";

describe("Harper voice", () => {
  it("rejects third-person seeker references and prep instructions in coaching", () => {
    expect(seekerFirstName("Jordan Hale")).toBe("Jordan");
    expect(
      harperCoachingVoiceViolations({
        text: "Jordan is a strong match for this role.",
        firstName: "Jordan",
      }),
    ).not.toEqual([]);
    expect(
      harperCoachingVoiceViolations({
        text: "The seeker has not built managers.",
        firstName: "Jordan",
      }),
    ).not.toEqual([]);
    expect(
      harperCoachingVoiceViolations({
        text: "The job wants manager development. I do not see that in your background.",
        firstName: "Jordan",
      }),
    ).toEqual([]);
    expect(
      seekerPrepInstructionViolations(
        "Close the management-depth gap with a specific example of hiring or developing sales managers.",
      ),
    ).not.toEqual([]);
    expect(
      seekerPrepInstructionViolations(
        "The job wants someone who has built front-line managers.",
      ),
    ).toEqual([]);
  });

  it("requires talk tracks in first person as I", () => {
    expect(
      talkTrackVoiceViolations({
        text: "Jordan has not built front-line managers yet.",
        firstName: "Jordan",
      }),
    ).not.toEqual([]);
    expect(
      talkTrackVoiceViolations({
        text: "I have not built front-line managers yet, and I would say that honestly.",
        firstName: "Jordan",
      }),
    ).toEqual([]);
  });

  it("does not rewrite Harper text after the model call", () => {
    const voice = readFileSync("src/lib/consultation/voice.ts", "utf8");
    const service = readFileSync("src/lib/consultation/service.ts", "utf8");
    const section = readFileSync("src/components/ConsultationSection.tsx", "utf8");
    expect(voice).not.toContain("function rewriteHarperCoachingVoice");
    expect(service).not.toContain("rewriteHarperCoachingVoice");
    expect(section).not.toContain("rewriteHarperCoachingVoice");
    const coach = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(coach).toContain('speak to the person as "you"');
    expect(coach).toContain("Ask one question per remaining important gap");
    expect(coach).toContain("storyPlan is []");
    expect(coach).toContain("ask which roles that background came from");
    expect(coach).toContain("Never lower a STRONG or PARTIAL rating");
    expect(coach).toContain("If any gap is still open, closingNote is null");
    expect(coach).not.toContain("Ask only the next remaining gap");
    const polish = readFileSync("src/lib/prompt-content/consultation.ts", "utf8");
    expect(polish).toContain('first person as "I"');
    expect(polish).toContain("When confirmedGap is true");
    const cheatSheet = readFileSync(
      "src/lib/prompt-content/application-summary.ts",
      "utf8",
    );
    expect(cheatSheet).toContain('uses "you"');
    expect(cheatSheet).toContain("is first person");
  });
});
