import { describe, expect, it } from "vitest";
import {
  APPLICATION_SUMMARY_PROMPT_VERSION,
  applicationSummaryGuidanceSchema,
} from "@/lib/application-summary/contract";
import {
  buildCheatSheetPeople,
  cheatSheetSectionKind,
} from "@/lib/application-summary/people";
import { validateApplicationSummaryGuidance } from "@/lib/application-summary/service";
import { applicationSummaryConfig } from "@/lib/product-config";

const spoken = "I rebuilt the forecast cadence.";
const item = { text: spoken, supports: [] };

describe("Interview Cheat Sheet", () => {
  it("renames the surface through the vocabulary module", () => {
    expect(applicationSummaryConfig.title).toBe("Interview cheat sheet");
    expect(APPLICATION_SUMMARY_PROMPT_VERSION).toBe("13");
    expect(JSON.stringify(applicationSummaryConfig)).not.toContain("Application Summary");
  });

  it("builds one section per interviewer and none for personas without an interviewer", () => {
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
        {
          contactId: "c-outreach",
          personaId: "role-hm",
          firstName: "Pat",
          lastName: "Lee",
          title: "VP Sales",
        },
      ],
      interviewerContactIds: ["c-recruiter"],
    });
    expect(people.map((person) => person.sectionKey)).toEqual(["contact:c-recruiter"]);
    expect(people.some((person) => person.sectionKey.startsWith("role:"))).toBe(false);
    expect(cheatSheetSectionKind(people[0]!)).toBe("RECRUITER");
  });

  it("parses a person section with coaching fields and does not gate on source quotes", () => {
    const guidance = applicationSummaryGuidanceSchema.parse({
      overview: {
        companyBackground: { text: "Acme sells warehouse software." },
        jobRequirements: [{ text: "Build a repeatable enterprise motion." }],
        whereSeekerShines: [{ text: spoken }],
      },
      people: [
        {
          sectionKey: "contact:christina",
          roleId: "role-hm",
          contactId: "christina",
          heading: "Christina Schivley",
          sectionKind: "HIRING_MANAGER",
          caresAbout: [
            {
              text: "Repeatable enterprise execution.",
              seekerConnection: "I rebuilt the forecast cadence, which is how I would run this motion.",
            },
          ],
          positioningStatements: [item],
          keyStatements: [item],
          likelyQuestions: [
            {
              prompt: "Tell me how you run a weekly forecast?",
              sampleAnswer: spoken,
              harperQuestion: null,
            },
          ],
          questionsToAsk: [
            {
              text: "What does a strong first 90 days look like for this hire?",
              followUps: ["What would make you worry in month one?"],
            },
          ],
        },
      ],
    });
    expect(guidance.people[0]?.positioningStatements[0]?.text).toBe(spoken);
    expect(
      validateApplicationSummaryGuidance({
        guidance,
        sources: [],
        people: [
          {
            sectionKey: "contact:christina",
            heading: "Wrong heading",
            sectionKind: "RECRUITER",
          },
        ],
        firstName: "Alex",
        checkGrounding: true,
      }),
    ).toEqual([]);
  });
});
