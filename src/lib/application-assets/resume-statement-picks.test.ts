import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESUME_WRITER_TEMPERATURE } from "@/lib/application-assets/ai";
import {
  RESUME_ASSET_PROMPT_VERSION,
  type ApplicationAssetContent,
} from "@/lib/application-assets/contract";
import { buildPresentationPlanMessages } from "@/lib/application-assets/plan-prompt";
import { buildResumeAssetMessages } from "@/lib/application-assets/prompt";
import { RESUME_PRESENTATION_PLAN_INSTRUCTIONS } from "@/lib/prompt-content/presentation-plan";
import {
  resumeCitationOutcome,
  resumeClaimCitationErrors,
} from "@/lib/application-assets/service";
import {
  BROADER_EXPERIENCE_TITLE,
  buildResumeWriterPackage,
  buildStatementGroups,
  workspaceSeenJsonWithPicks,
  type PickerProfile,
  type PickerStatement,
} from "@/lib/application-assets/resume-statement-picks";
import {
  DEFAULT_HARPER_DRAFT_SETTINGS,
  parseHarperDraftSettings,
} from "@/lib/consultation/harper-draft-settings";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";

const asOf = new Date("2026-10-06T00:00:00.000Z");
const forecast = {
  targetKey: "required:forecast",
  text: "Own the quarterly forecast",
  strength: "STRONG",
};

function statement(
  id: string,
  content: string,
  targetKey: string | null = null,
): PickerStatement {
  return { id, kind: "INTERVIEW_ANSWER", content, targetKey };
}

function checkedIds(profile: PickerProfile, statements: PickerStatement[], settings = DEFAULT_HARPER_DRAFT_SETTINGS, directRoleIds: string[] = []) {
  return buildStatementGroups({
    profile,
    statements,
    assessments: [forecast, { targetKey: "required:quota", text: "Carry a quota", strength: "PARTIAL" }],
    settings,
    savedPickIds: null,
    primaryRoleId: null,
    directRoleIds,
    asOf,
  });
}

const salesProfile: PickerProfile = {
  experience: [
    { id: "opentext", employer: "OpenText", title: "Account Executive", endDate: null },
    { id: "legacy", employer: "Legacy Systems", title: "Sales Representative", endDate: "2004-06" },
  ],
  educationTexts: [],
  projectTexts: [],
};

const nursingProfile: PickerProfile = {
  experience: [
    { id: "mercy", employer: "Mercy General", title: "Registered Nurse", endDate: null },
  ],
  educationTexts: ["State University"],
  projectTexts: [],
};

const graduateProfile: PickerProfile = {
  experience: [],
  educationTexts: [],
  projectTexts: ["Capstone project"],
};

describe("Harper Approved Statements picker", () => {
  it("groups sales, nursing, and new-graduate statements and pre-checks within each role's range", () => {
    const salesStatements = [
      statement("ot-strong", "At OpenText I owned the quarterly forecast.", "required:forecast"),
      statement("ot-partial", "At OpenText I carried a quota.", "required:quota"),
      ...Array.from({ length: 6 }, (_, index) =>
        statement(`ot-0${index + 3}`, `At OpenText I ran play ${index + 3}.`),
      ),
      statement("legacy-1", "At Legacy Systems I carried a bag."),
    ];
    const sales = checkedIds(salesProfile, salesStatements);
    const openText = sales.find((group) => group.title === "OpenText");
    const legacy = sales.find((group) => group.title === "Legacy Systems");
    expect(openText?.items[0]?.requirementLabel).toBe("Own the quarterly forecast");
    expect(openText?.items.filter((item) => item.checked)).toHaveLength(7);
    expect(openText?.items.find((item) => item.id === "ot-strong")?.checked).toBe(true);
    expect(openText?.items.find((item) => item.id === "ot-08")?.checked).toBe(false);
    expect(openText && openText.minBullets >= 3 && openText.maxBullets <= 7).toBe(true);
    expect(legacy?.titleOnly).toBe(true);
    expect(legacy?.items.every((item) => !item.checked)).toBe(true);

    const nursing = checkedIds(nursingProfile, [
      statement("su-1", "At State University I precepted new nurses."),
      statement("su-2", "At State University I led a medication safety huddle."),
      statement("su-3", "At State University I taught wound care."),
      statement("su-4", "At State University I covered an extra shift."),
    ]);
    const school = nursing.find((group) => group.title === "State University");
    expect(school?.items.filter((item) => item.checked)).toHaveLength(3);
    expect(school && school.items.filter((item) => item.checked).length <= school.maxBullets).toBe(true);

    const graduate = checkedIds(graduateProfile, [
      statement("cap-1", "In my Capstone project I shipped a clinic intake form."),
      statement("cap-2", "In my Capstone project I interviewed patients."),
      statement("loose", "I collaborate with every team."),
    ]);
    const project = graduate.find((group) => group.title === "Capstone project");
    const broader = graduate.find((group) => group.id === "broader");
    expect(project?.items.every((item) => item.checked)).toBe(true);
    expect(broader?.title).toBe(BROADER_EXPERIENCE_TITLE);
    expect(broader?.title).toBe("Broader experience");
    expect(broader?.items.map((item) => item.id)).toEqual(["loose"]);
  });

  it("lets Super Admin bands change the recommended set", () => {
    const statements = Array.from({ length: 8 }, (_, index) =>
      statement(`ot-${index}`, "At OpenText I closed an enterprise deal."),
    );
    const tighter = parseHarperDraftSettings({
      ...DEFAULT_HARPER_DRAFT_SETTINGS,
      recentPrimaryBulletMax: 4,
    });
    const groups = checkedIds(salesProfile, statements, tighter);
    expect(groups.find((group) => group.title === "OpenText")?.items.filter((item) => item.checked)).toHaveLength(4);
    expect(readFileSync("src/components/platform/HarperDraftSettingsForm.tsx", "utf8")).toContain(
      "recentPrimaryBulletMax",
    );
  });

  it("sends every pick as required content and keeps a 15-year role to title, company, and dates unless it is relevant", () => {
    const statements = [
      statement("ot-strong", "At OpenText I owned the quarterly forecast.", "required:forecast"),
      statement("legacy-1", "At Legacy Systems I carried a bag."),
    ];
    const unused = buildResumeWriterPackage({
      profile: salesProfile,
      statements,
      assessments: [forecast],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: null,
      directRoleIds: [],
      planCondensedRoleIds: [],
      asOf,
    });
    expect(unused.requiredStatements.some((item) => item.roleId === "opentext" && item.content.includes("OpenText"))).toBe(true);
    expect(unused.roleBulletPlans.find((plan) => plan.roleId === "legacy")?.titleOnly).toBe(true);
    const relevant = buildResumeWriterPackage({
      profile: salesProfile,
      statements,
      assessments: [forecast],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: null,
      directRoleIds: ["legacy"],
      planCondensedRoleIds: [],
      asOf,
    });
    expect(relevant.roleBulletPlans.find((plan) => plan.roleId === "legacy")?.titleOnly).toBe(false);
    expect(relevant.requiredStatements.some((item) => item.roleId === "legacy")).toBe(true);

    const messages = buildResumeAssetMessages({
      context: {
        requirement: null,
        profile: {
          identity: {},
          experience: [],
          education: [],
          skills: [],
          credentials: [],
        },
        sources: [],
        approvedStatements: [],
        stories: [],
        voiceSamples: [],
        campaign: { applicationGuidance: null },
      } as unknown as ReadyApplicationGenerationContext,
      hiddenRoleIds: [],
      condensedRoleIds: unused.condensedRoleIds,
      regenerationInstruction: null,
      qualityFeedback: [],
      requiredStatements: unused.requiredStatements,
      roleBulletPlans: unused.roleBulletPlans,
    });
    const guidance = JSON.parse(messages[2]?.content ?? "{}") as {
      requiredStatements: Array<{ roleId: string; content: string }>;
      roleBulletPlans: Array<{ roleId: string; titleOnly: boolean }>;
    };
    expect(guidance.requiredStatements.some((item) => item.roleId === "opentext")).toBe(true);
    expect(guidance.roleBulletPlans.find((plan) => plan.roleId === "legacy")?.titleOnly).toBe(true);
  });

  it("stops the presentation plan from choosing stories and writes the resume at temperature 0", () => {
    expect(RESUME_PRESENTATION_PLAN_INSTRUCTIONS).not.toContain("which stories and bullets to feature");
    expect(RESUME_PRESENTATION_PLAN_INSTRUCTIONS).toContain("Do not choose stories");
    const messages = buildPresentationPlanMessages({
      type: "RESUME",
      application: { title: "Account Executive", employer: "Acme" },
      roles: [],
      stories: [{ id: "story-1", result: "Closed a deal" }],
      assessments: [],
      adjustmentNote: null,
      qualityFeedback: [],
    });
    expect(JSON.parse(messages[1]?.content ?? "{}").stories).toEqual([]);
    expect(messages[0]?.content).toContain("Prompt version: 4");
    expect(RESUME_ASSET_PROMPT_VERSION).toBe("11");
    expect(RESUME_WRITER_TEMPERATURE).toBe(0);
    const writer = readFileSync("src/lib/application-assets/ai.ts", "utf8");
    expect(writer).toContain("temperature: RESUME_WRITER_TEMPERATURE");
  });

  it("retries an uncited resume claim once and does not save when the retry still fails", () => {
    const claim = (id: string, sourceId: string) => ({
      id,
      text: "Closed the forecast.",
      supports: [{ sourceId, quote: "forecast" }],
    });
    const content = {
      type: "RESUME",
      header: { name: claim("name", "profile:name"), contactDetails: [] },
      summary: [claim("summary", "job:1")],
      experience: [],
      skills: [],
      education: [],
      credentials: [],
    } as ApplicationAssetContent;
    const context = {
      sources: [
        { id: "profile:name", category: "PROFILE_FACT", text: "Ada", url: null },
        { id: "job:1", category: "JOB_REQUIREMENT", text: "Own the forecast", url: null },
      ],
      assessments: [],
    } as unknown as ReadyApplicationGenerationContext;
    const violations = resumeClaimCitationErrors(content, context);
    expect(violations.some((line) => line.includes("summary"))).toBe(true);
    expect(resumeCitationOutcome({ attempt: 0, violations })).toBe("retry");
    expect(resumeCitationOutcome({ attempt: 1, violations })).toBe("reject");
    expect(resumeCitationOutcome({ attempt: 1, violations: [] })).toBe("save");
    const service = readFileSync("src/lib/application-assets/service.ts", "utf8");
    const loop = service.slice(service.indexOf("for (let attempt = 0; attempt < 2"));
    expect(loop.indexOf("validateAssetContent")).toBeGreaterThan(-1);
    expect(loop.indexOf("validateAssetContent")).toBeLessThan(loop.indexOf("saveVersion"));
    expect(loop).toContain('outcome === "reject"');
    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const saveStart = action.indexOf("export async function saveResumeStatementPicksAction");
    const save = action.slice(saveStart, action.indexOf("function errorResult", saveStart));
    expect(save).not.toContain("enqueueApplicationJob");
  });

  it("keeps saved picks when the workspace seen state is rewritten", () => {
    const previous = { v: 2, assets: "resume", resumeStatementPickIds: ["stmt-1"] };
    const next = workspaceSeenJsonWithPicks(previous, { v: 2, assets: "resume-2" }) as {
      resumeStatementPickIds: string[];
    };
    expect(next.resumeStatementPickIds).toEqual(["stmt-1"]);
  });
});
