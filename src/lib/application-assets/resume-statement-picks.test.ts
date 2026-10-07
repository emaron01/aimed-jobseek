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
  assignCandidateBullets,
  buildResumeBulletCandidateMessages,
  selectableBulletEvidence,
  storedCandidatesMatch,
} from "@/lib/application-assets/resume-bullet-candidates";
import { resumeWithExactPickedBullets } from "@/lib/application-assets/service";
import {
  buildResumeWriterPackage,
  buildStatementGroups,
  candidateCountForBand,
  resumeStatementPicksFromCampaign,
  roleBulletBands,
  type PickerBullet,
  type PickerProfile,
} from "@/lib/application-assets/resume-statement-picks";
import { RESUME_ASSET_INSTRUCTIONS, RESUME_BULLET_CANDIDATE_INSTRUCTIONS } from "@/lib/prompt-content/application-assets";
import { applicationAssetConfig } from "@/lib/product-config";
import {
  DEFAULT_HARPER_DRAFT_SETTINGS,
  parseHarperDraftSettings,
} from "@/lib/consultation/harper-draft-settings";
import type { ReadyApplicationGenerationContext } from "@/lib/generation/context";

const asOf = new Date("2026-10-06T00:00:00.000Z");

function bullet(
  id: string,
  roleId: string,
  text: string,
  jobSpecific: boolean,
): PickerBullet {
  return { id, roleId, text, jobSpecific };
}

function groupsFor(
  profile: PickerProfile,
  bullets: PickerBullet[],
  settings = DEFAULT_HARPER_DRAFT_SETTINGS,
  directRoleIds: string[] = [],
) {
  return buildStatementGroups({
    profile,
    bullets,
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
  it("shows every role in a band, up to twice the maximum, and pre-checks within the band", () => {
    const recentSecond: PickerProfile = {
      experience: [
        { id: "opentext", employer: "OpenText", title: "Account Executive", endDate: null },
        { id: "vmware", employer: "VMware", title: "Account Executive", endDate: "2024-06" },
        { id: "legacy", employer: "Legacy Systems", title: "Sales Representative", endDate: "2004-06" },
      ],
      educationTexts: [],
      projectTexts: [],
    };
    const bands = roleBulletBands({
      profile: recentSecond,
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      primaryRoleId: null,
      directRoleIds: [],
      asOf,
    });
    expect(bands.map((band) => band.roleId)).toEqual(["opentext", "vmware"]);
    expect(bands.find((band) => band.roleId === "vmware")?.candidateCount).toBe(
      candidateCountForBand(5, false),
    );
    const vmwareBullets = [
      bullet("job", "vmware", "Closed a multi-year hospital contract.", true),
      ...Array.from({ length: 12 }, (_, index) =>
        bullet(`general-${index}`, "vmware", `Ran a general sales play ${index}.`, false),
      ),
    ];
    const sales = groupsFor(recentSecond, [
      ...Array.from({ length: 12 }, (_, index) =>
        bullet(`ot-${index}`, "opentext", `Owned an OpenText forecast cycle ${index}.`, true),
      ),
      ...vmwareBullets,
      bullet("old", "legacy", "Carried a bag at Legacy Systems.", true),
    ]);
    const openText = sales.find((group) => group.roleId === "opentext");
    const vmware = sales.find((group) => group.roleId === "vmware");
    expect(sales.some((group) => group.roleId === "legacy")).toBe(false);
    expect(openText?.title).toBe("Account Executive, OpenText");
    expect(openText?.items).toHaveLength(12);
    expect(openText?.items.filter((item) => item.checked)).toHaveLength(7);
    expect(vmware?.maxBullets).toBe(5);
    expect(vmware?.items).toHaveLength(10);
    expect(vmware?.items[0]?.id).toBe("job");
    expect(vmware?.items.filter((item) => item.checked)).toHaveLength(3);
    expect(vmware?.items.filter((item) => item.checked).slice(1).every((item) => item.id.startsWith("general"))).toBe(true);

    const nursing = groupsFor(
      {
        ...nursingProfile,
        experience: [
          ...nursingProfile.experience,
          { id: "clinic", employer: "City Clinic", title: "Nurse", endDate: "2024-01" },
        ],
      },
      [
        bullet("mercy-1", "mercy", "Precepted new nurses on the night shift.", true),
        bullet("clinic-job", "clinic", "Led a medication safety huddle.", true),
        bullet("clinic-general", "clinic", "Covered an extra weekend shift.", false),
        bullet("clinic-general-2", "clinic", "Taught wound care to new graduates.", false),
      ],
    );
    expect(nursing.map((group) => group.roleId)).toEqual(["mercy", "clinic"]);
    expect(nursing.find((group) => group.roleId === "clinic")?.items.map((item) => item.id)).toEqual([
      "clinic-job",
      "clinic-general",
      "clinic-general-2",
    ]);

    const graduate = groupsFor(
      {
        experience: [
          { id: "intern", employer: "County Hospital", title: "Nursing Intern", endDate: null },
        ],
        educationTexts: [],
        projectTexts: [],
      },
      [bullet("intern-1", "intern", "Shipped a clinic intake form during a capstone rotation.", true)],
    );
    expect(graduate.map((group) => group.roleId)).toEqual(["intern"]);
    expect(graduate[0]?.items[0]?.content).toBe("Shipped a clinic intake form during a capstone rotation.");
    expect(groupsFor(graduateProfile, [])).toEqual([]);
  });

  it("lets Super Admin bands change the recommended set", () => {
    const tighter = parseHarperDraftSettings({
      ...DEFAULT_HARPER_DRAFT_SETTINGS,
      recentPrimaryBulletMax: 4,
    });
    const groups = groupsFor(
      salesProfile,
      Array.from({ length: 8 }, (_, index) =>
        bullet(`ot-${index}`, "opentext", "Closed an enterprise deal.", true),
      ),
      tighter,
    );
    const openText = groups.find((group) => group.roleId === "opentext");
    expect(openText?.title).toBe("Account Executive, OpenText");
    expect(openText?.items.filter((item) => item.checked)).toHaveLength(4);
    expect(readFileSync("src/components/platform/HarperDraftSettingsForm.tsx", "utf8")).toContain(
      "recentPrimaryBulletMax",
    );
  });

  it("sends every pick as required content and keeps a 15-year role to title, company, and dates unless it is relevant", () => {
    const bullets = [
      bullet("ot-strong", "opentext", "Owned the quarterly forecast at OpenText.", true),
      bullet("legacy-1", "legacy", "Carried a bag at Legacy Systems.", true),
    ];
    const unused = buildResumeWriterPackage({
      profile: salesProfile,
      bullets,
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
      bullets,
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
    expect(RESUME_ASSET_PROMPT_VERSION).toBe("12");
    expect(RESUME_WRITER_TEMPERATURE).toBe(0);
    expect(RESUME_ASSET_INSTRUCTIONS).toContain(
      "Use each picked bullet exactly as written, in the role it was picked for. Do not rewrite a picked bullet and do not add a bullet that was not picked. You may write the summary, the skills, and each role's title, company, and dates.",
    );
    expect(RESUME_BULLET_CANDIDATE_INSTRUCTIONS).toContain(
      "When one piece of evidence covers more than one role, write a separate bullet for each role. For each role, write up to the number of bullets given for that role. Start each bullet with a strong action verb and include the result or number when the seeker stated one.",
    );
  });

  it("writes one-line bullets for role ids, excludes other applications, and uses picks exactly", () => {
    const assigned = assignCandidateBullets({
      bands: [
        { roleId: "opentext", candidateCount: 10 },
        { roleId: "mercy", candidateCount: 10 },
        { roleId: "intern", candidateCount: 10 },
      ],
      bullets: [
        { roleId: "opentext", text: "Closed enterprise deals\nat OpenText.", jobSpecific: true },
        { roleId: "missing-role", text: "This role is not on the profile.", jobSpecific: true },
        { roleId: "mercy", text: "Precepted new nurses at Mercy General.", jobSpecific: false },
        { roleId: "intern", text: "Shipped a clinic intake form.", jobSpecific: true },
      ],
    });
    expect(assigned.map((item) => item.roleId)).toEqual(["opentext", "mercy", "intern"]);
    expect(assigned[0]?.text.includes("\n")).toBe(false);
    expect(assigned[0]?.text).toBe("Closed enterprise deals at OpenText.");
    const evidence = selectableBulletEvidence({
      campaignId: "sift",
      achievements: [
        { id: "ach-1", text: "Closed a seven-figure renewal." },
        { id: "why-this-company:csc", text: "I want to work at CSC." },
      ],
      statements: [
        { content: "Owned the forecast.", kind: "INTERVIEW_ANSWER", campaignId: "sift", targetKey: "required:forecast" },
        { content: "I want this company.", kind: "INTERVIEW_ANSWER", campaignId: "sift", targetKey: "why-this-company" },
        { content: "A 90-day plan for CSC.", kind: "INTERVIEW_ANSWER", campaignId: "csc", targetKey: "required:plan" },
        { content: "Cut the sales cycle.", kind: "RESUME_BULLET", campaignId: "sift", targetKey: null },
      ],
      replies: [
        { body: "I precepted new nurses.", campaignId: "sift" },
        { body: "I wrote this for CSC.", campaignId: "csc" },
      ],
    });
    expect(evidence.map((item) => item.text)).toEqual([
      "Closed a seven-figure renewal.",
      "Owned the forecast.",
      "Cut the sales cycle.",
      "I precepted new nurses.",
    ]);
    const roles = roleBulletBands({
      profile: salesProfile,
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      primaryRoleId: null,
      directRoleIds: [],
      asOf,
    });
    const messages = buildResumeBulletCandidateMessages({
      roles: roles.map((role) => ({
        roleId: role.roleId,
        employer: role.employer,
        title: role.title,
        candidateCount: role.candidateCount,
      })),
      evidence,
      job: { title: "Account Executive", employer: "Sift", posting: "Own the forecast." },
    });
    const payload = JSON.parse(messages[1]?.content ?? "{}") as {
      roles: Array<{ roleId: string; candidateCount: number }>;
    };
    expect(payload.roles.find((role) => role.roleId === "opentext")?.candidateCount).toBe(14);
    const exact = resumeWithExactPickedBullets(
      {
        type: "RESUME",
        header: {
          name: { id: "name", text: "Ada", supports: [{ sourceId: "profile:name", quote: "Ada" }] },
          contactDetails: [],
        },
        summary: [{ id: "summary", text: "Account executive.", supports: [{ sourceId: "profile:name", quote: "Ada" }] }],
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
              { id: "invented", text: "Invented a recruiting program.", supports: [{ sourceId: "profile:name", quote: "Ada" }] },
            ],
          },
        ],
        skills: [{ id: "skill", text: "Forecasting", supports: [{ sourceId: "profile:name", quote: "Ada" }] }],
        education: [],
        credentials: [],
      },
      [{ statementId: "pick-1", roleId: "opentext", content: "Owned the quarterly forecast at OpenText." }],
      "profile:name",
    );
    expect(exact.experience[0]?.bullets.map((item) => item.text)).toEqual([
      "Owned the quarterly forecast at OpenText.",
    ]);
    expect(exact.summary[0]?.text).toBe("Account executive.");
    expect(exact.skills[0]?.text).toBe("Forecasting");
    expect(storedCandidatesMatch("abc", "abc")).toBe(true);
    expect(storedCandidatesMatch(null, "abc")).toBe(false);
    const picker = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    expect(picker).not.toContain("interviewAnswerPick");
    expect(picker).not.toContain("coversRequirement");
    expect(picker).not.toContain("requirementLabel");
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const pickerData = readFileSync("src/lib/application-assets/resume-statement-picker-data.ts", "utf8");
    expect(workspace).not.toContain("runPaidStructuredCall");
    expect(pickerData).not.toContain("runPaidStructuredCall");
    const prepare = readFileSync("src/lib/application-assets/resume-bullet-candidate-service.ts", "utf8");
    const prepareFn = prepare.slice(prepare.indexOf("export async function prepareResumeBulletCandidates"));
    expect(prepareFn.indexOf("storedCandidatesMatch")).toBeLessThan(prepareFn.indexOf("runPaidStructuredCall"));
    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const prepareStart = action.indexOf("export async function prepareResumeBulletCandidatesAction");
    const prepareBody = action.slice(prepareStart, action.indexOf("export async function saveResumeStatementPicksAction"));
    expect(prepareBody).not.toContain("enqueueApplicationJob");
    const generateAction = action.slice(action.indexOf("export async function generateApplicationAssetAction"));
    expect(generateAction.indexOf("prepareResumeBulletCandidates")).toBeLessThan(
      generateAction.indexOf("applicationAssetGenerateWouldSkip"),
    );
    const service = readFileSync("src/lib/application-assets/service.ts", "utf8");
    const generateStart = service.indexOf("export async function generateApplicationAsset");
    const generateFn = service.slice(generateStart);
    expect(generateFn.indexOf("prepareResumeBulletCandidates")).toBeLessThan(
      generateFn.indexOf("loadResumeWriterFields"),
    );
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
