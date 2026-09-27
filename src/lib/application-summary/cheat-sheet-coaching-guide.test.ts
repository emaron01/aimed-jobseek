import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  interviewerContactIdsFrom,
  personSectionNeedsGeneration,
} from "@/lib/application-summary/people";
import { sourcesForPersonSection } from "@/lib/application-summary/service";
import { applicationSummaryConfig } from "@/lib/product-config";

describe("Interview cheat sheet coaching guide", () => {
  it("shows the shared top section and interviewer coaching fields, not stories or timestamps", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const body = readFileSync("src/components/CheatSheetPersonBody.tsx", "utf8");
    const prompt = readFileSync("src/lib/prompt-content/application-summary.ts", "utf8");
    const labels = JSON.stringify(applicationSummaryConfig);
    expect(page).toContain("companyBackground");
    expect(page).toContain("jobRequirements");
    expect(page).toContain("whereSeekerShines");
    expect(page).not.toContain("Generated ");
    expect(page).not.toContain("id=\"stories\"");
    expect(page).not.toContain("thisStoryAnswers");
    expect(page.toLowerCase()).not.toContain("synthesis");
    expect(body).toContain("unbuiltPersona");
    expect(body).toContain("buildCheatSheetPersonaAction");
    expect(body).toContain("positioningStatements");
    expect(body).toContain("keyStatements");
    expect(body).toContain("likelyQuestions");
    expect(body).toContain("questionsToAsk");
    expect(body).not.toContain("This story answers");
    expect(prompt.toLowerCase()).not.toMatch(/\bsynthesis\b/);
    expect(prompt).toContain("Tell me how you");
    expect(prompt).toContain("Never merge");
    expect(labels).toContain(applicationSummaryConfig.sections.unbuiltPersona);
    expect(applicationSummaryConfig.actions.buildPersonaNow).toBe("Yes");
  });

  it("treats stage interviewers and know-who people as interviewers", () => {
    expect(
      interviewerContactIdsFrom({
        stageInterviewerIds: ["c-stage"],
        contacts: [
          { contactId: "c-know", personPrepOfferedAt: new Date() },
          { contactId: "c-outreach", personPrepOfferedAt: null },
        ],
      }).sort(),
    ).toEqual(["c-know", "c-stage"]);
  });

  it("regenerates a person section when coaching fields are missing and keeps a complete one", () => {
    expect(personSectionNeedsGeneration(null)).toBe(true);
    expect(
      personSectionNeedsGeneration({
        caresAbout: [{}],
        positioningStatements: [{}],
        keyStatements: [{}],
        likelyQuestions: [{}],
        questionsToAsk: [{}],
      }),
    ).toBe(false);
    expect(
      personSectionNeedsGeneration({
        caresAbout: [{}],
        positioningStatements: [],
        keyStatements: [{}],
        likelyQuestions: [{}],
        questionsToAsk: [{}],
      }),
    ).toBe(true);
  });

  it("uses the general persona and the person's own evidence together, including likelyToValue", () => {
    const sources = sourcesForPersonSection({
      roleId: "role-hm",
      contactId: "c-1",
      noteIds: ["n-1"],
      sources: [
        { id: "persona:role-hm:overview", text: "Owns enterprise revenue.", category: "PERSONA" },
        { id: "persona:role-other:overview", text: "Other role.", category: "PERSONA" },
        {
          id: "interviewer-own:c-1:0",
          text: "Cares about forecast discipline.",
          category: "INTERVIEWER_OWN",
        },
        {
          id: "interviewer-pattern:c-1:0",
          text: "Likely to value operating cadence.",
          category: "INTERVIEWER_PATTERN",
        },
        { id: "interviewer-pattern:c-2:0", text: "Someone else.", category: "INTERVIEWER_PATTERN" },
        { id: "linkedin:c-1", text: "Christina leads sales at CSC.", category: "LINKEDIN" },
        { id: "intel:n-1", text: "They want to hear about enterprise motion.", category: "INTERVIEW_INTEL" },
        { id: "job:title", text: "Director of Enterprise Sales", category: "JOB" },
      ],
    });
    expect(sources.map((source) => source.id)).toEqual([
      "persona:role-hm:overview",
      "interviewer-own:c-1:0",
      "interviewer-pattern:c-1:0",
      "linkedin:c-1",
      "intel:n-1",
      "job:title",
    ]);
  });

  it("enqueues a person section when an interviewer is added or their information is saved", () => {
    const stages = readFileSync("src/lib/interview/stages.ts", "utf8");
    const hiringTeam = readFileSync("src/app/actions/hiring-team.ts", "utf8");
    const notes = readFileSync("src/lib/application-summary/service.ts", "utf8");
    const contactProfile = readFileSync("src/lib/contact-profile/service.ts", "utf8");
    const process = readFileSync("src/lib/application-jobs/process.ts", "utf8");
    expect(stages).toContain("enqueueInterviewerCheatSheetSection");
    expect(stages).not.toContain("if (people.some((person) => person.sectionKey === sectionKey))");
    expect(hiringTeam).toContain("enqueueInterviewerCheatSheetSection");
    expect(notes).toContain("enqueueCheatSheetPersonSection");
    // Paste queues CONTACT_PROFILE only; cheat sheet runs once after profile finishes.
    expect(contactProfile).not.toContain("enqueueInterviewerCheatSheetSection");
    expect(process).toMatch(
      /case "CONTACT_PROFILE":[\s\S]*enqueueInterviewerCheatSheetSection/,
    );
    expect(process).toContain("enqueueCheatSheetSectionsForPersona");
    expect(notes).not.toContain("validateGroundedStatement");
    expect(notes).not.toContain("qualityFeedback = errors");
  });
});