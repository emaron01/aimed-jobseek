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
  claimMatchesSeekerEvidence,
  dropUngroundedResumeClaims,
  logRemovedResumeClaims,
  resumeCitationOutcome,
  resumeClaimCitationErrors,
  resumeVersionUsable,
} from "@/lib/application-assets/service";
import {
  BROADER_EXPERIENCE_TITLE,
  buildResumeWriterPackage,
  buildStatementGroups,
  resumeStatementPicksFromCampaign,
  type PickerProfile,
  type PickerStatement,
} from "@/lib/application-assets/resume-statement-picks";
import { applicationAssetConfig } from "@/lib/product-config";
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

  it("accepts a claim found only in a seeker's reply and drops an invented claim", () => {
    const reply = "I precepted new nurses at State University.";
    const sources = [
      { id: "reply:1", category: "SEEKER_REPLY", text: reply },
      { id: "profile:name", category: "PROFILE_FACT", text: "Ada Lovelace closed enterprise deals at OpenText." },
      { id: "job:1", category: "JOB_REQUIREMENT", text: "Own the forecast", url: null },
    ];
    const grounded = {
      id: "grounded",
      text: reply,
      supports: [{ sourceId: "reply:1", quote: reply }],
    };
    expect(claimMatchesSeekerEvidence(grounded, sources)).toBe(true);
    const context = {
      sources,
      assessments: [],
    } as unknown as ReadyApplicationGenerationContext;
    const claim = (id: string, text: string, sourceId: string) => ({
      id,
      text,
      supports: [{ sourceId, quote: text }],
    });
    const content = {
      type: "RESUME" as const,
      header: {
        name: claim("name", "Ada Lovelace", "profile:name"),
        contactDetails: [],
      },
      summary: [claim("summary", "Ada Lovelace closed enterprise deals at OpenText.", "profile:name")],
      experience: [
        {
          roleId: "opentext",
          employer: "OpenText",
          title: "Account Executive",
          startDate: "2020-01",
          endDate: null,
          location: null,
          hidden: false,
          condensed: false,
          bullets: [
            claim("kept", reply, "reply:1"),
            claim("invented", "Recruited two representatives who became top performers.", "job:1"),
          ],
        },
      ],
      skills: [],
      education: [],
      credentials: [],
    };
    expect(resumeClaimCitationErrors(content, context).some((line) => line.includes("kept"))).toBe(false);
    expect(resumeClaimCitationErrors(content, context).some((line) => line.includes("invented"))).toBe(true);
    const logged: string[] = [];
    const info = console.info;
    console.info = (message?: unknown) => {
      logged.push(String(message));
    };
    const dropped = dropUngroundedResumeClaims(content, context);
    logRemovedResumeClaims(dropped.removed);
    console.info = info;
    expect(dropped.removed.map((item) => item.id)).toEqual(["invented"]);
    expect(dropped.content.experience[0]?.bullets.map((item) => item.id)).toEqual(["kept"]);
    expect(resumeVersionUsable(dropped.content)).toBe(true);
    expect(logged.some((line) => line.includes("resume_claim_removed") && line.includes("invented"))).toBe(true);

    const emptyBody = {
      ...content,
      summary: [claim("summary", "Invented a revenue number of $9MM.", "job:1")],
      experience: [{ ...content.experience[0], bullets: [claim("invented", "Recruited two representatives who became top performers.", "job:1")] }],
    };
    const cleared = dropUngroundedResumeClaims(emptyBody, context);
    expect(resumeVersionUsable(cleared.content)).toBe(false);
    expect(applicationAssetConfig.labels.resumeRegenerateUnchanged).toBe(
      "Harper couldn't write a new version this time. Your current resume is unchanged. Please regenerate.",
    );
    const service = readFileSync("src/lib/application-assets/service.ts", "utf8");
    const loop = service.slice(service.indexOf("for (let attempt = 0; attempt < 2"));
    expect(loop).toContain("resumeClaimCitationErrors");
    expect(loop).toContain("dropUngroundedResumeClaims");
    expect(loop).toContain("resumeRegenerateUnchanged");
    expect(loop.indexOf("dropUngroundedResumeClaims")).toBeLessThan(loop.lastIndexOf("saveVersion"));
  });

  it("keeps a paraphrased bullet that cites an approved statement and drops a bullet that cites a missing source", () => {
    const statement = "Closed a multi-year agreement with a hospital system.";
    const paraphrased = "Negotiated a multi-year hospital contract and expanded the account.";
    const sources = [
      { id: "statement:1", category: "APPROVED_STATEMENT", text: statement },
      { id: "profile:name", category: "PROFILE_FACT", text: "Ada Lovelace" },
    ];
    const context = {
      sources,
      assessments: [],
    } as unknown as ReadyApplicationGenerationContext;
    const claim = (id: string, text: string, sourceId: string) => ({
      id,
      text,
      supports: [{ sourceId, quote: text }],
    });
    const content = {
      type: "RESUME" as const,
      header: {
        name: claim("name", "Ada Lovelace", "profile:name"),
        contactDetails: [],
      },
      summary: [claim("summary", "Sells into hospital systems.", "statement:1")],
      experience: [
        {
          roleId: "opentext",
          employer: "OpenText",
          title: "Account Executive",
          startDate: "2020-01",
          endDate: null,
          location: null,
          hidden: false,
          condensed: false,
          bullets: [
            claim("kept", paraphrased, "statement:1"),
            claim("missing", "Built a forecasting practice from scratch.", "statement:missing"),
          ],
        },
      ],
      skills: [],
      education: [],
      credentials: [],
    };
    expect(statement.includes(paraphrased)).toBe(false);
    expect(claimMatchesSeekerEvidence(content.experience[0].bullets[0], sources)).toBe(true);
    expect(claimMatchesSeekerEvidence(content.experience[0].bullets[1], sources)).toBe(false);
    const dropped = dropUngroundedResumeClaims(content, context);
    expect(dropped.removed.map((item) => item.id)).toEqual(["missing"]);
    expect(dropped.content.experience[0]?.bullets.map((item) => item.id)).toEqual(["kept"]);
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
    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const saveStart = action.indexOf("export async function saveResumeStatementPicksAction");
    const save = action.slice(saveStart, action.indexOf("function errorResult", saveStart));
    expect(save).not.toContain("enqueueApplicationJob");
  });

  it("keeps picks when workspace seen changes and carries over picks already stored there", () => {
    const seen = { v: 2, assets: "resume", resumeStatementPickIds: ["stmt-1"] };
    const carried = resumeStatementPicksFromCampaign({
      resumeStatementPicksJson: null,
      workspaceSeenJson: seen,
    });
    expect(carried.picks).toEqual(["stmt-1"]);
    expect(carried.carryOver).toEqual(["stmt-1"]);
    const afterSeenRewrite = resumeStatementPicksFromCampaign({
      resumeStatementPicksJson: ["stmt-1"],
      workspaceSeenJson: { v: 2, assets: "resume-2" },
    });
    expect(afterSeenRewrite.picks).toEqual(["stmt-1"]);
    expect(afterSeenRewrite.carryOver).toBeNull();
    const cleared = resumeStatementPicksFromCampaign({
      resumeStatementPicksJson: [],
      workspaceSeenJson: seen,
    });
    expect(cleared.picks).toEqual([]);
    expect(cleared.carryOver).toBeNull();
    const tracker = readFileSync("src/lib/application/tracker.ts", "utf8");
    expect(tracker).not.toContain("workspaceSeenJsonWithPicks");
    const migration = readFileSync(
      "prisma/migrations/20261006204500_campaign_resume_statement_picks/migration.sql",
      "utf8",
    );
    expect(migration).toContain('ADD COLUMN "resumeStatementPicksJson" JSONB');
    expect(migration).toContain("resumeStatementPickIds");
  });
});
