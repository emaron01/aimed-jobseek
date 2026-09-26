import { describe, expect, it } from "vitest";
import { buildCheatSheetPeople } from "@/lib/application-summary/people";
import { applicationSummaryConfig, vocab } from "@/lib/product-config";
import {
  cheatSheetPrintSectionId,
  cheatSheetSectionsForDisplay,
  matchCheatSheetFilterOptions,
  type CheatSheetFilterOption,
} from "@/lib/application-summary/filter";

function optionsFromPeople(): CheatSheetFilterOption[] {
  return buildCheatSheetPeople({
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
    ],
    contacts: [
      {
        contactId: "c-alex",
        personaId: "role-hm",
        firstName: "Alex",
        lastName: "Rivera",
        title: "Director of Sales",
      },
    ],
  }).map((person) => ({
    sectionKey: person.sectionKey,
    heading: person.heading,
    personName: person.contactId ? person.heading : null,
    personaName: person.roleName,
    titles: person.titles,
  }));
}

const sharedSectionKeys = ["overview", "stories", "company", "position", "stages"];

describe("Interview cheat sheet people filter", () => {
  it("names the filter through the product configuration module", () => {
    expect(applicationSummaryConfig.actions.filterPeople).toContain(
      vocab.persona.singular,
    );
    expect(applicationSummaryConfig.actions.filterPlaceholder).toContain(
      vocab.persona.singular,
    );
  });

  it("finds a section by person name, persona name, and title", () => {
    const options = optionsFromPeople();
    expect(
      matchCheatSheetFilterOptions(options, "alex rivera").map((item) => item.sectionKey),
    ).toEqual(["contact:c-alex"]);
    expect(
      matchCheatSheetFilterOptions(options, "talent acquisition").map(
        (item) => item.sectionKey,
      ),
    ).toEqual(["role:role-ta"]);
    expect(
      matchCheatSheetFilterOptions(options, "director of sales").map(
        (item) => item.sectionKey,
      ),
    ).toEqual(["contact:c-alex"]);
  });

  it("shows only the selected section and restores every section when cleared", () => {
    const options = optionsFromPeople();
    const personKeys = options.map((item) => item.sectionKey);
    expect(
      cheatSheetSectionsForDisplay({
        personSectionKeys: personKeys,
        sharedSectionKeys,
        selectedKey: "contact:c-alex",
      }),
    ).toEqual(["contact:c-alex"]);
    expect(
      cheatSheetSectionsForDisplay({
        personSectionKeys: personKeys,
        sharedSectionKeys,
        selectedKey: null,
      }),
    ).toEqual([...sharedSectionKeys, ...personKeys]);
  });

  it("prints only the filtered section", () => {
    expect(cheatSheetPrintSectionId("contact:c-alex")).toBe("contact:c-alex");
    expect(cheatSheetPrintSectionId(null)).toBeUndefined();
    expect(
      cheatSheetSectionsForDisplay({
        personSectionKeys: ["contact:c-alex", "role:role-ta"],
        sharedSectionKeys,
        selectedKey: "contact:c-alex",
      }),
    ).toEqual(["contact:c-alex"]);
  });
});
