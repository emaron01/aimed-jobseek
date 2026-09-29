import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  interviewerExtractionSchema,
  interviewerWorkExperience,
  linkedInExtractedSchema,
} from "@/lib/contact-profile/contract";
import { interviewerExtractFromModel } from "@/lib/contact-profile/extract";
import { INTERVIEWER_EXTRACTION_INSTRUCTIONS } from "@/lib/prompt-content/interviewer-extraction";

const generateStructured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isPersonaAiConfigured: () => true,
    getPersonaAiProvider: () => ({ generateStructured }),
  };
});

vi.mock("@/lib/contact-profile/paid-inputs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/contact-profile/paid-inputs")>();
  return {
    ...actual,
    runGatedContactProfileExtract: async (input: {
      callProvider: () => Promise<unknown>;
    }) => ({ data: await input.callProvider(), skipped: false }),
  };
});

const LINKEDIN_PASTE = `Dana Reyes
VP Revenue Operations at Northline
About
I rebuild forecasts leadership can trust.
Experience
VP Revenue Operations
Northline · Full-time
Apr 2023 - Present · Indianapolis
Installed MEDDPICC across the enterprise team.
- Cut forecast slip by 12 points
Director of Revenue Operations
Helios
Jan 2019 - Mar 2023
Education
Purdue University
Licenses & certifications
Salesforce Administrator
Skills
Forecasting
`;

const BIO_PASTE = `Erik Chen is Vice President of Sales at Harborline, where he has led the enterprise motion since 2021. Before Harborline he was Director of Sales at Helios from 2017 to 2021, where he implemented MEDDPICC and ran deal reviews for a 40-person team. He studied economics at Purdue.`;

const TEAM_PAGE_PASTE = `Christina Schivley, Head of Talent at CSC. Christina joined CSC in 2019 after leading campus recruiting at Northwind. She now owns interviewer training and the hiring process for go-to-market roles.`;

function linkedInModelResult() {
  return interviewerExtractionSchema.parse({
    headline: "VP Revenue Operations at Northline",
    about: "I rebuild forecasts leadership can trust.",
    currentTitle: "VP Revenue Operations",
    currentEmployer: "Northline",
    currentTenure: "Apr 2023 - Present",
    workExperience: [
      {
        employer: "Northline",
        title: "VP Revenue Operations",
        dates: "Apr 2023 - Present",
        location: "Indianapolis",
        description: "Installed MEDDPICC across the enterprise team.",
        accomplishments: ["Cut forecast slip by 12 points"],
      },
      {
        employer: "Helios",
        title: "Director of Revenue Operations",
        dates: "Jan 2019 - Mar 2023",
        location: "",
        description: "",
        accomplishments: [],
      },
    ],
    education: ["Purdue University"],
    certifications: ["Salesforce Administrator"],
    skills: ["Forecasting"],
    statedFocus: ["Forecasts leadership can trust"],
  });
}

function bioModelResult() {
  return interviewerExtractionSchema.parse({
    headline: "Vice President of Sales at Harborline",
    about: "",
    currentTitle: "Vice President of Sales",
    currentEmployer: "Harborline",
    currentTenure: "since 2021",
    workExperience: [
      {
        employer: "Harborline",
        title: "Vice President of Sales",
        dates: "2021 - Present",
        location: "",
        description: "Leads the enterprise motion.",
        accomplishments: [],
      },
      {
        employer: "Helios",
        title: "Director of Sales",
        dates: "2017 - 2021",
        location: "",
        description:
          "Implemented MEDDPICC and ran deal reviews for a 40-person team.",
        accomplishments: ["Implemented MEDDPICC"],
      },
    ],
    education: ["Purdue"],
    certifications: [],
    skills: [],
    statedFocus: [],
  });
}

function teamPageModelResult() {
  return interviewerExtractionSchema.parse({
    headline: "Head of Talent at CSC",
    about: "",
    currentTitle: "Head of Talent",
    currentEmployer: "CSC",
    currentTenure: "since 2019",
    workExperience: [
      {
        employer: "CSC",
        title: "Head of Talent",
        dates: "2019 - Present",
        location: "",
        description:
          "Owns interviewer training and the hiring process for go-to-market roles.",
        accomplishments: [],
      },
      {
        employer: "Northwind",
        title: "Campus recruiting lead",
        dates: "",
        location: "",
        description: "Led campus recruiting.",
        accomplishments: [],
      },
    ],
    education: [],
    certifications: [],
    skills: [],
    statedFocus: [],
  });
}

function thinModelResult() {
  return interviewerExtractionSchema.parse({
    headline: "",
    about: "",
    currentTitle: "",
    currentEmployer: "CSC",
    currentTenure: "",
    workExperience: [],
    education: [],
    certifications: [],
    skills: [],
    statedFocus: [],
  });
}

describe("interviewer extraction from any pasted text", () => {
  beforeEach(() => {
    generateStructured.mockReset();
    generateStructured.mockImplementation(async (request: {
      messages: Array<{ content: string }>;
    }) => {
      const pasted = JSON.parse(request.messages[1]!.content).pastedText as string;
      if (pasted.includes("Experience") && pasted.includes("Northline")) {
        return { data: linkedInModelResult() };
      }
      if (pasted.includes("Erik Chen")) return { data: bioModelResult() };
      if (pasted.includes("Christina Schivley")) {
        return { data: teamPageModelResult() };
      }
      return { data: thinModelResult() };
    });
  });

  it("reads a pasted LinkedIn page, a bio, and a team-page paragraph into work experience", async () => {
    const { extractInterviewerFacts } = await import(
      "@/lib/contact-profile/extract"
    );
    const linkedIn = await extractInterviewerFacts({
      organizationId: "org-test",
      campaignId: "camp-test",
      contactId: "contact-dana",
      pastedText: LINKEDIN_PASTE,
      contactName: "Dana Reyes",
    });
    const bio = await extractInterviewerFacts({
      organizationId: "org-test",
      campaignId: "camp-test",
      contactId: "contact-erik",
      pastedText: BIO_PASTE,
      contactName: "Erik Chen",
    });
    const team = await extractInterviewerFacts({
      organizationId: "org-test",
      campaignId: "camp-test",
      contactId: "contact-christina",
      pastedText: TEAM_PAGE_PASTE,
      contactName: "Christina Schivley",
    });
    expect(linkedIn.ok).toBe(true);
    expect(bio.ok).toBe(true);
    expect(team.ok).toBe(true);
    if (!linkedIn.ok || !bio.ok || !team.ok) return;
    expect(interviewerWorkExperience(linkedIn.data).length).toBeGreaterThan(0);
    expect(linkedIn.data.workExperience[0]?.description?.text).toContain(
      "MEDDPICC",
    );
    expect(linkedIn.data.workExperience[0]?.accomplishments[0]?.text).toContain(
      "forecast slip",
    );
    expect(interviewerWorkExperience(bio.data).map((role) => role.employer?.text)).toEqual(
      ["Harborline", "Helios"],
    );
    expect(bio.data.workExperience[1]?.description?.text).toContain("MEDDPICC");
    expect(
      interviewerWorkExperience(team.data).map((role) => role.employer?.text),
    ).toEqual(["CSC", "Northwind"]);
    expect(generateStructured).toHaveBeenCalledTimes(3);
    const firstUser = JSON.parse(
      generateStructured.mock.calls[0]![0].messages[1].content,
    );
    expect(firstUser.pastedText).toContain("Experience");
    expect(INTERVIEWER_EXTRACTION_INSTRUCTIONS).toContain(
      "Never rely on headings being present",
    );
    expect(INTERVIEWER_EXTRACTION_INSTRUCTIONS).toContain(
      "full description of what they did",
    );
  });

  it("produces a partial extract from thin text with no error", async () => {
    const { extractInterviewerFacts } = await import(
      "@/lib/contact-profile/extract"
    );
    const thin = await extractInterviewerFacts({
      organizationId: "org-test",
      campaignId: "camp-test",
      contactId: "contact-thin",
      pastedText: "Christina works at CSC.",
      contactName: "Christina",
    });
    expect(thin.ok).toBe(true);
    if (!thin.ok) return;
    expect(thin.data.currentEmployer?.text).toBe("CSC");
    expect(thin.data.workExperience).toEqual([]);
    expect(thin.data.headline).toBeNull();
  });

  it("keeps extracts saved in the old shape loadable", () => {
    const stored = linkedInExtractedSchema.parse({
      currentTitle: {
        text: "Director",
        kind: "FACT",
        provenance: [{ sourceId: "linkedin-paste" }],
      },
      currentEmployer: {
        text: "Northwind",
        kind: "FACT",
        provenance: [{ sourceId: "linkedin-paste" }],
      },
      currentTenure: null,
      priorRoles: [
        {
          employer: {
            text: "Helios",
            kind: "FACT",
            provenance: [{ sourceId: "linkedin-paste" }],
          },
          title: null,
        },
      ],
      education: [],
      statedFocus: [],
    });
    expect(stored.workExperience).toEqual([]);
    expect(interviewerWorkExperience(stored).map((role) => role.employer?.text)).toEqual(
      ["Northwind", "Helios"],
    );
  });

  it("leaves fields the text did not contain empty", () => {
    const extracted = interviewerExtractFromModel(thinModelResult());
    expect(extracted.headline).toBeNull();
    expect(extracted.about).toBeNull();
    expect(extracted.currentTitle).toBeNull();
    expect(extracted.certifications).toEqual([]);
    expect(extracted.skills).toEqual([]);
    expect(extracted.currentEmployer?.text).toBe("CSC");
  });
});
