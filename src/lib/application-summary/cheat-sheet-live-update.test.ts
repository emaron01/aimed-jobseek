import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationSummaryGuidanceSchema } from "@/lib/application-summary/contract";
import { statedListItems } from "@/lib/application-summary/display";
import { sourcesForShell } from "@/lib/application-summary/service";
import { APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS } from "@/lib/prompt-content/application-summary";

const spoken = "I rebuilt the forecast cadence.";
const item = { text: spoken, supports: [] };
const person = {
  sectionKey: "contact:christina",
  roleId: "role-hm",
  contactId: "christina",
  heading: "Christina Schivley",
  sectionKind: "HIRING_MANAGER" as const,
  caresAbout: [{ text: "Repeatable enterprise execution.", seekerConnection: spoken }],
  positioningStatements: [item],
  keyStatements: [item],
  likelyQuestions: [
    { prompt: "Tell me how you run a weekly forecast?", sampleAnswer: spoken, harperQuestion: null },
  ],
  questionsToAsk: [{ text: "What does a strong first 90 days look like?" }],
};

describe("Interview cheat sheet live update and headings", () => {
  it("refreshes the cheat sheet page when generation completes or fails", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    const live = readFileSync("src/components/ApplicationWorkspaceLive.tsx", "utf8");
    expect(page).toContain("WorkspaceJobRefresh");
    expect(page).toContain("initialSignature={live.signature}");
    expect(page).toContain("WorkspaceProgress");
    expect(page).toContain("APPLICATION_SUMMARY");
    expect(page).toContain("stayAndWatch");
    expect(live).toContain("export function WorkspaceJobRefresh");
    expect(live).toContain("router.refresh()");
    expect(live).toContain("latest.signature !== signature.current");
    expect(live).toContain('job.status === "FAILED"');
  });

  it("writes company background from research and job requirements from the posting, never seeker career or gaps", () => {
    const prompt = APPLICATION_SUMMARY_GUIDANCE_SYSTEM_INSTRUCTIONS;
    expect(prompt).toContain("COMPANY sources");
    expect(prompt).toContain("what they do");
    expect(prompt).toContain("JOB sources");
    expect(prompt).toContain("Never the seeker's career");
    expect(prompt).toContain("Never the seeker's gaps");
    const parsed = applicationSummaryGuidanceSchema.parse({
      overview: {
        companyBackground: { text: "Acme sells warehouse software." },
        jobRequirements: [{ text: "Build a repeatable enterprise motion." }],
        whereSeekerShines: [{ text: spoken }],
        careerRecap: { text: "I have led enterprise sales teams." },
        gapsToPrepare: [
          {
            prompt: "Local enterprise motion",
            sampleAnswer: spoken,
            harperQuestion: null,
          },
        ],
      },
      people: [person],
    });
    expect(parsed.overview?.companyBackground.text).toBe("Acme sells warehouse software.");
    expect(parsed.overview?.jobRequirements.map((row) => row.text)).toEqual([
      "Build a repeatable enterprise motion.",
    ]);
    expect(parsed.overview?.companyBackground.text).not.toContain("I have led");
    expect(parsed.overview?.jobRequirements.some((row) => row.text.includes("Local enterprise"))).toBe(
      false,
    );
    const missingNewFields = applicationSummaryGuidanceSchema.safeParse({
      overview: {
        careerRecap: { text: "I have led enterprise sales teams." },
        gapsToPrepare: [
          { prompt: "Local enterprise motion", sampleAnswer: spoken, harperQuestion: null },
        ],
      },
      people: [person],
    });
    expect(missingNewFields.success).toBe(false);
    expect(
      sourcesForShell([
        { id: "research:summary", text: "Acme sells warehouse software.", category: "COMPANY" },
        { id: "job:posting", text: "Build a repeatable enterprise motion.", category: "JOB" },
        { id: "profile:ach_1", text: "I grew a book from $9M to $21M.", category: "SEEKER" },
        {
          id: "assessment:gap",
          text: "The seeker has not run this motion here yet.",
          category: "ASSESSMENT",
        },
      ]).map((source) => source.category),
    ).toEqual(["COMPANY", "JOB", "SEEKER"]);
  });

  it("uses Not stated. only when a list is empty", () => {
    expect(statedListItems(["Fortune 500 operations leaders", "Not stated."])).toEqual([
      "Fortune 500 operations leaders",
    ]);
    expect(statedListItems(["Not stated.", "Not stated"])).toEqual([]);
    expect(statedListItems([])).toEqual([]);
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    expect(page).toContain("statedListItems");
    expect(page).toContain("hiringSignals");
    expect(page).toMatch(/statedListItems\(lines\(view\.research\?\.hiringSignals\)\)\.length > 0/);
  });
});
