import { describe, expect, it } from "vitest";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryGuidanceSchema,
} from "@/lib/application-summary/contract";
import {
  buildCheatSheetPeople,
  cheatSheetSectionKind,
} from "@/lib/application-summary/people";
import { storyTextsRepeatVerbatim } from "@/lib/application-summary/service";
import { applicationSummaryConfig } from "@/lib/product-config";

const support = [{ sourceId: "story:1", quote: "I rebuilt the forecast cadence." }];

describe("Interview Cheat Sheet", () => {
  it("renames the surface through the vocabulary module", () => {
    expect(applicationSummaryConfig.title).toBe("Interview cheat sheet");
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("5");
    expect(JSON.stringify(applicationSummaryConfig)).not.toContain("Application Summary");
  });

  it("builds one section per Direct role or linked contact and tailors by type", () => {
    const people = buildCheatSheetPeople({
      roles: [
        {
          id: "role-ta",
          name: "Talent Acquisition Partner",
          titles: ["Recruiter"],
          involvement: "DIRECT",
          suggestionKey: "recruiter",
        },
        {
          id: "role-hm",
          name: "Hiring Manager",
          titles: ["VP Sales"],
          involvement: "DIRECT",
          suggestionKey: "hiring_manager",
        },
        {
          id: "role-cs",
          name: "Customer Success Leader",
          titles: ["VP Customer Success"],
          involvement: "INDIRECT",
          suggestionKey: null,
        },
      ],
      contacts: [
        {
          contactId: "c-recruiter",
          personaId: "role-ta",
          firstName: "Avery",
          lastName: "Ng",
          title: "Talent Acquisition Partner",
        },
      ],
    });
    expect(people.map((person) => person.sectionKey)).toEqual([
      "contact:c-recruiter",
      "role:role-hm",
      "role:role-cs",
    ]);
    expect(cheatSheetSectionKind(people[0]!)).toBe("RECRUITER");
    expect(cheatSheetSectionKind(people[1]!)).toBe("HIRING_MANAGER");
    expect(cheatSheetSectionKind(people[2]!)).toBe("CROSS_FUNCTIONAL");
  });

  it("rejects verbatim story repetition and keeps one story with variations", () => {
    const guidance = applicationSummaryGuidanceSchema.parse({
      overview: {
        thirtySecondFit: { text: "Fit.", supports: support },
        careerRecap: { text: "Recap.", supports: support },
        gapsToPrepare: [{ text: "Gap.", supports: support }],
      },
      stories: [
        {
          storyId: "story-1",
          headline: "Forecast cadence",
          situation: "I rebuilt the forecast cadence.",
          answers: [
            { requirement: "Forecast discipline", question: "How do you run forecast?" },
          ],
          variations: [
            {
              angle: "Forecast discipline",
              text: "I rebuilt the forecast cadence.",
              supports: support,
            },
            {
              angle: "Manager coaching",
              text: "I rebuilt the forecast cadence.",
              supports: support,
            },
          ],
        },
      ],
      people: [],
    });
    expect(storyTextsRepeatVerbatim(guidance)).toBe(true);
    const unique = applicationSummaryGuidanceSchema.parse({
      ...guidance,
      stories: [
        {
          ...guidance.stories[0]!,
          variations: [
            {
              angle: "Forecast discipline",
              text: "I held managers to a weekly commit against pipeline quality.",
              supports: support,
            },
            {
              angle: "Manager coaching",
              text: "I coached two first-line managers to inspect deals before the call.",
              supports: support,
            },
          ],
        },
      ],
    });
    expect(storyTextsRepeatVerbatim(unique)).toBe(false);
  });
});
