import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileApplicationInterviewNotes } from "@/lib/application-summary/interview-notes";
import {
  applicationStepList,
  applicationSummaryConfig,
  hiringTeamConfig,
  interviewConfig,
} from "@/lib/product-config";

describe("Interview Preparation Guides layout", () => {
  it("renames seeker-facing labels and the company section", () => {
    expect(applicationSummaryConfig.title).toBe("Interview Preparation Guides");
    expect(applicationSummaryConfig.actions.generate).toBe(
      "Generate Interview Preparation Guides",
    );
    expect(applicationSummaryConfig.actions.regenerate).toBe(
      "Regenerate Interview Preparation Guides",
    );
    expect(applicationSummaryConfig.actions.retry).toBe(
      "Retry Interview Preparation Guides",
    );
    expect(applicationSummaryConfig.sections.company).toBe("Full Company Profile");
    expect(applicationSummaryConfig.sections.interviewPersonas).toBe("Interview Personas");
    expect(applicationSummaryConfig.sections.generalStudyQuestions).toBe(
      "General Study Questions",
    );
    expect(applicationSummaryConfig.sections.consolidatedInterviewNotes).toBe(
      "Consolidated Interview Notes",
    );
    expect(applicationSummaryConfig.sections.position).toBe("Position");
    expect(applicationStepList.find((step) => step.key === "summary")?.title).toBe(
      "Interview Preparation Guides",
    );
    expect(hiringTeamConfig.actions.addToCheatSheet).toBe(
      "Add to Interview Preparation Guides",
    );
    expect(hiringTeamConfig.actions.removeFromCheatSheet).toBe(
      "Remove from Interview Preparation Guides",
    );
    expect(interviewConfig.labels.addGainedInformation).toBe(
      "Save and Add Note to Interview Preparation Guides",
    );
  });

  it("puts the guide sections and five primary cards in order and drops Interview stages", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const body = readFileSync("src/components/CheatSheetPersonBody.tsx", "utf8");
    const cards = [
      'testId="prep-guide-personas"',
      'testId="prep-guide-general-questions"',
      'testId="prep-guide-consolidated-notes"',
      'testId="prep-guide-position"',
      'testId="prep-guide-company"',
    ];
    let last = -1;
    for (const id of cards) {
      const at = page.indexOf(id);
      expect(at, id).toBeGreaterThan(last);
      last = at;
    }

    const mapStart = page.indexOf("{view.people.map");
    const mapEnd = page.indexOf("</PrepGuidePrimaryCard>", mapStart);
    const map = page.slice(mapStart, mapEnd);
    const overview = map.indexOf("-overview");
    const notes = map.indexOf("-guide-notes");
    const personBody = map.indexOf("<CheatSheetPersonBody");
    const company = map.indexOf("-company");
    expect(overview).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(overview);
    expect(personBody).toBeGreaterThan(notes);
    expect(company).toBeGreaterThan(personBody);
    expect(map).toContain("<AtAGlanceBody");
    expect(map).toContain("<CheatSheetInterviewNotes notes={applicationInterviewNotes}");
    expect(map).toContain("<CompanyProfileBody");
    expect(map).not.toContain("compileNotesFromInterviewsWithPerson");

    const cares = body.indexOf("sections.caresAbout");
    const positioning = body.indexOf("sections.positioningStatements");
    const key = body.indexOf("sections.keyStatements");
    const likely = body.indexOf("sections.likelyQuestions");
    const ask = body.indexOf("sections.questionsToAsk");
    expect(cares).toBeGreaterThan(-1);
    expect(positioning).toBeGreaterThan(cares);
    expect(key).toBeGreaterThan(positioning);
    expect(likely).toBeGreaterThan(key);
    expect(ask).toBeGreaterThan(likely);

    expect(page).not.toContain('id="stages"');
    expect(page).not.toContain("sections.interviewStages");
    expect(page).not.toContain('CheatSheetSection id="overview"');
    expect(page).toContain("border-2 border-edge-strong bg-surface");
    expect(page).toContain('body[data-print-section] .application-summary-section');

    const compiled = compileApplicationInterviewNotes({
      people: [
        {
          contactId: "ada",
          name: "Ada Lovelace",
          notes: [
            {
              id: "old",
              text: "older note",
              createdAt: "2026-01-01T00:00:00.000Z",
              stageId: null,
            },
            {
              id: "new",
              text: "newer note",
              createdAt: "2026-06-01T00:00:00.000Z",
              stageId: null,
            },
          ],
        },
      ],
      stages: [],
    });
    expect(compiled.map((note) => note.text)).toEqual(["newer note", "older note"]);
    expect(compiled[0]?.personName).toBe("Ada Lovelace");
  });
});
