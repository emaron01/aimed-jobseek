import { describe, expect, it } from "vitest";
import {
  CONTACT_PROFILE_PROMPT_VERSION,
  individualProfileRecordSchema,
  individualProfileSchema,
} from "@/lib/contact-profile/contract";
import { CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS } from "@/lib/prompt-content/contact-individual-profile";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/application-summary";
import { sourcesForPersonSection } from "@/lib/application-summary/service";

describe("interviewer experience synthesis", () => {
  it("asks for a pattern with its evidence and an empty array when the profile is thin", () => {
    expect(CONTACT_PROFILE_PROMPT_VERSION).toBe("4");
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).toContain("likelyToValue");
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).toContain(
      "roles, role descriptions, and accomplishments",
    );
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).toContain(
      "return likelyToValue as an empty array",
    );
    expect(CONTACT_INDIVIDUAL_PROFILE_INSTRUCTIONS).toContain(
      "never write that the profile was thin",
    );
  });

  it("accepts an empty synthesis without complaint", () => {
    const parsed = individualProfileSchema.parse({
      caresAbout: [{ text: "Pipeline hygiene", kind: "INFERENCE" }],
      talkingPoints: [{ text: "Ask about their forecast cadence", kind: "INFERENCE" }],
      likelyToValue: [],
    });
    expect(parsed.likelyToValue).toEqual([]);
  });

  it("keeps individual profiles built before the synthesis readable", () => {
    const stored = individualProfileRecordSchema.parse({
      caresAbout: [{ text: "Pipeline hygiene", kind: "INFERENCE" }],
      talkingPoints: [{ text: "Ask about their forecast cadence", kind: "INFERENCE" }],
      commonGround: [],
      promptVersion: "1",
    });
    expect(stored.likelyToValue).toEqual([]);
  });

  it("routes each interviewer's synthesis only to their own cheat sheet section", () => {
    const sources = [
      { id: "persona:role_1:impact", text: "Owns the number.", category: "PERSONA" },
      {
        id: "interviewer-pattern:contact_1:0",
        text: "Dana is big on MEDDPICC.",
        category: "INTERVIEWER_PATTERN",
      },
      {
        id: "interviewer-pattern:contact_2:0",
        text: "Sam is big on onboarding ramp.",
        category: "INTERVIEWER_PATTERN",
      },
    ];
    const dana = sourcesForPersonSection({
      sources,
      contactId: "contact_1",
      roleId: "role_1",
      noteIds: [],
    }).map((source) => source.id);
    expect(dana).toContain("interviewer-pattern:contact_1:0");
    expect(dana).not.toContain("interviewer-pattern:contact_2:0");
    expect(dana).toContain("persona:role_1:impact");

    const noContact = sourcesForPersonSection({
      sources,
      contactId: null,
      roleId: "role_1",
      noteIds: [],
    }).map((source) => source.id);
    expect(noContact).toEqual(["persona:role_1:impact"]);
  });

  it("tells the cheat sheet to connect the seeker's material to what the interviewer built", () => {
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain("INTERVIEWER_PATTERN");
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain("seekerConnection");
    expect(APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS).toContain("Never merge");
  });
});
