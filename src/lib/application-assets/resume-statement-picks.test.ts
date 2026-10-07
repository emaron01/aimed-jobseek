import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESUME_WRITER_TEMPERATURE } from "@/lib/application-assets/ai";
import {
  RESUME_ASSET_PROMPT_VERSION,
  RESUME_BULLET_CANDIDATE_PROMPT_VERSION,
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
  resumeWithExactPickedBullets,
} from "@/lib/application-assets/service";
import {
  applyBulletTextEdits,
  assignCandidateBullets,
  attributedEvidenceRole,
  buildResumeBulletCandidateMessages,
  bulletEditEvidence,
  bulletResultKey,
  profileWithBulletRoleChoices,
  profileWithBulletTextEdits,
  profileWithDismissedBullet,
  profileWithoutSeekerBullet,
  profileWithSeekerBullet,
  readDismissedBulletTexts,
  questionTextForAnswer,
  readSeekerBullets,
  seekerBulletEvidence,
  readBulletTextEdits,
  selectableBulletEvidence,
  replaceUnpickedCandidates,
  splitEvidenceByEmployer,
  storedCandidatesMatch,
} from "@/lib/application-assets/resume-bullet-candidates";
import { profileWithoutDismissedResults } from "@/lib/application-assets/resume-statement-picker-data";
import {
  buildResumeWriterPackage,
  buildStatementGroups,
  bulletDisplayId,
  carryProfileHiddenRoles,
  readResumePicksHiddenRoleIds,
  resumePicksWithRoleLeftOff,
  candidateCountForBand,
  orderRolesMostRecentFirst,
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
import {
  emptyCandidateProfile,
  parseCandidateProfileSafe,
} from "@/lib/product-research/candidate-profile";

const asOf = new Date("2026-10-06T00:00:00.000Z");

function bullet(
  id: string,
  roleId: string,
  text: string,
  jobSpecific: boolean,
): PickerBullet {
  return { id, roleId, text, jobSpecific, evidenceIds: [] };
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
    expect(bands.map((band) => band.roleId)).toEqual(["opentext", "vmware", "legacy"]);
    expect(bands.find((band) => band.roleId === "legacy")?.titleOnly).toBe(true);
    expect(bands.find((band) => band.roleId === "legacy")?.maxBullets).toBe(0);
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
    const legacy = sales.find((group) => group.roleId === "legacy");
    expect(legacy?.titleOnly).toBe(true);
    expect(legacy?.items.map((item) => item.content)).toEqual(["Carried a bag at Legacy Systems."]);
    expect(legacy?.items[0]?.checked).toBe(false);
    expect(legacy?.items[0]?.recommended).toBe(false);
    expect(openText?.title).toBe("Account Executive, OpenText");
    expect(openText?.items).toHaveLength(12);
    expect(openText?.items.filter((item) => item.checked)).toHaveLength(7);
    expect(vmware?.maxBullets).toBe(5);
    expect(vmware?.items).toHaveLength(13);
    expect(vmware?.items[0]?.id).toBe("job");
    expect(vmware?.items.filter((item) => item.checked)).toHaveLength(5);
    expect(vmware?.items.filter((item) => item.checked).map((item) => item.id)).toEqual([
      "job",
      "general-0",
      "general-1",
      "general-2",
      "general-3",
    ]);

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
    expect(RESUME_ASSET_PROMPT_VERSION).toBe("14");
    expect(RESUME_WRITER_TEMPERATURE).toBe(0);
    expect(RESUME_ASSET_INSTRUCTIONS).toContain(
      "Write the summary in two or three sentences that name the seeker's strongest stated results, with their numbers, before describing skills or methods.",
    );
    expect(RESUME_ASSET_INSTRUCTIONS).toContain(
      "You may write the summary, the skills, and each role's title, company, and dates.",
    );
    expect(RESUME_ASSET_INSTRUCTIONS).not.toContain("Use each picked bullet exactly as written");
    expect(RESUME_ASSET_INSTRUCTIONS).not.toContain("Use approved resume bullets when they are strong");
    expect(RESUME_ASSET_INSTRUCTIONS).toContain("SEEKER_REPLY");
    expect(RESUME_BULLET_CANDIDATE_PROMPT_VERSION).toBe("7");
    expect(RESUME_BULLET_CANDIDATE_INSTRUCTIONS).toBe(
      [
        "Write resume bullet candidates from the seeker's own evidence for this job.",
        "Facts: Use only the supplied evidence. The seeker's words are the facts. Never add or change a number, employer, customer, title, date, credential, skill, or outcome.",
        "Placement: Put each bullet under the role where it happened: the role whose employer the evidence or its question names, or the role an achievement is listed under. If you cannot tell, give your best guess and set needsJobCheck to true. If the evidence is not about any one role, set roleId to null. Each bullet covers one employer.",
        "Ownership: Describe the seeker's real part. Say the seeker led, managed, or coached others only when the evidence says so for that role. When a team result came from the seeker's coaching, say so, for example \"Coached the team to close...\".",
        "Content: Write up to the number of bullets given for each role, best first: the seeker's biggest stated results (numbers, named customers, scope, awards), then bullets that speak to this job. Every distinct result with a number appears in a bullet. Never write two bullets for the same result. Write bullets only for accomplishments; skip work arrangements, commute, pay, availability, and why the seeker wants the job.",
        "Style: One line, under 30 words. Start with a strong verb and the result. Do not name the employer; the job heading shows it. Customer and partner names are fine. Name at most two teams or departments. Leave story details, such as system counts and step-by-step methods, for interviews. No filler endings.",
        "Return structured JSON only.",
        "Output shape: { bullets: [{ roleId (or null), text, evidenceIds, needsJobCheck }] }. Each role's requested count is its band maximum (not twice it). Keep the existing split of evidence that names more than one employer.",
      ].join("\n"),
    );
  });

  it("writes one-line bullets for role ids, excludes other applications, and uses picks exactly", () => {
    const assigned = assignCandidateBullets({
      bands: [
        { roleId: "opentext", employer: "OpenText", candidateCount: 10 },
        { roleId: "mercy", employer: "Mercy General", candidateCount: 10 },
        { roleId: "intern", employer: "County Hospital", candidateCount: 10 },
      ],
      evidence: [
        { id: "ev-ot", kind: "INTERVIEW_ANSWER", text: "Closed enterprise deals at OpenText.", roleId: null },
        { id: "ev-mercy", kind: "INTERVIEW_ANSWER", text: "Precepted new nurses at Mercy General.", roleId: null },
        { id: "ev-intern", kind: "ACHIEVEMENT", text: "Shipped a clinic intake form.", roleId: "intern" },
      ],
      bullets: [
        { roleId: "opentext", text: "Closed enterprise\ndeals.", jobSpecific: true, evidenceIds: ["ev-ot"] },
        { roleId: "missing-role", text: "This role is not on the profile.", jobSpecific: true, evidenceIds: ["missing-evidence"] },
        { roleId: "mercy", text: "Precepted new nurses.", jobSpecific: false, evidenceIds: ["ev-mercy"] },
        { roleId: "intern", text: "Shipped a clinic intake form.", jobSpecific: true, evidenceIds: ["ev-intern"] },
      ],
    });
    expect(assigned.map((item) => item.roleId)).toEqual(["opentext", "mercy", "intern"]);
    expect(assigned[0]?.text.includes("\n")).toBe(false);
    expect(assigned[0]?.text).toBe("Closed enterprise deals.");
    const evidence = selectableBulletEvidence({
      campaignId: "sift",
      achievements: [
        { id: "ach-1", text: "Closed a seven-figure renewal.", roleId: "opentext" },
        { id: "why-this-company:csc", text: "I want to work at CSC.", roleId: "opentext" },
      ],
      statements: [
        { id: "stmt-forecast", content: "Owned the forecast.", kind: "INTERVIEW_ANSWER", campaignId: "sift", targetKey: "required:forecast" },
        { id: "stmt-why", content: "I want this company.", kind: "INTERVIEW_ANSWER", campaignId: "sift", targetKey: "why-this-company" },
        { id: "stmt-csc", content: "A 90-day plan for CSC.", kind: "INTERVIEW_ANSWER", campaignId: "csc", targetKey: "required:plan", sourceEmployer: "CSC" },
        { id: "stmt-library", content: "Closed a multi-threaded $1.3MM Bank of America deal.", kind: "INTERVIEW_ANSWER", campaignId: "csc", targetKey: "required:deal", question: "Tell me about a deal you closed at OpenText.", sourceEmployer: "CSC" },
        { id: "stmt-cycle", content: "Cut the sales cycle.", kind: "RESUME_BULLET", campaignId: "sift", targetKey: null },
      ],
      replies: [
        { id: "reply-nurses", body: "I precepted new nurses.", campaignId: "sift" },
        { id: "reply-csc", body: "I wrote this for CSC.", campaignId: "csc" },
      ],
    });
    expect(evidence.map((item) => item.text)).toEqual([
      "Owned the forecast.",
      "Closed a multi-threaded $1.3MM Bank of America deal.",
      "Cut the sales cycle.",
      "Closed a seven-figure renewal.",
      "I precepted new nurses.",
    ]);
    expect(evidence[1]?.question).toContain("OpenText");
    expect(evidence.findIndex((item) => item.kind === "ACHIEVEMENT")).toBeGreaterThan(0);
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
    expect(payload.roles.find((role) => role.roleId === "opentext")?.candidateCount).toBe(7);
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
    expect(generateAction).not.toContain("prepareResumeBulletCandidates");
    const service = readFileSync("src/lib/application-assets/service.ts", "utf8");
    const generateStart = service.indexOf("export async function generateApplicationAsset");
    const generateFn = service.slice(generateStart);
    expect(generateFn).not.toContain("prepareResumeBulletCandidates");
  });

  it("keeps a bullet only with its own employer or its own profile achievement", () => {
    const evidence = [
      { id: "ot-answer", kind: "INTERVIEW_ANSWER" as const, text: "Held forecast deviation to 5-10% at OpenText in FY26.", roleId: null },
      { id: "vmware-answer", kind: "INTERVIEW_ANSWER" as const, text: "Closed a multi-year hospital contract at VMware.", roleId: null },
      { id: "mercy-ach", kind: "ACHIEVEMENT" as const, text: "Precepted new nurses on the night shift.", roleId: "mercy" },
      { id: "clinic-ach", kind: "ACHIEVEMENT" as const, text: "Led a medication safety huddle.", roleId: "clinic" },
      { id: "intern-ach", kind: "ACHIEVEMENT" as const, text: "Shipped a clinic intake form during a capstone rotation.", roleId: "intern" },
      { id: "no-employer", kind: "SEEKER_REPLY" as const, text: "I want a team that will teach me.", roleId: null },
    ];
    const bands = [
      { roleId: "opentext", employer: salesProfile.experience[0]!.employer ?? "", candidateCount: 10 },
      { roleId: "vmware", employer: "VMware", candidateCount: 10 },
      { roleId: "mercy", employer: nursingProfile.experience[0]!.employer ?? "", candidateCount: 10 },
      { roleId: "clinic", employer: "City Clinic", candidateCount: 10 },
      { roleId: "intern", employer: "County Hospital", candidateCount: 10 },
    ];
    const logged: string[] = [];
    const info = console.info;
    console.info = (message?: unknown) => {
      if (typeof message === "string") logged.push(message);
    };
    const assigned = assignCandidateBullets({
      bands,
      evidence,
      bullets: [
        { roleId: "vmware", text: "Held forecast deviation to 5-10% in FY26.", jobSpecific: true, evidenceIds: ["ot-answer"] },
        { roleId: "opentext", text: "Held forecast deviation to 5-10% at OpenText.", jobSpecific: true, evidenceIds: ["ot-answer"] },
        { roleId: "clinic", text: "Precepted new nurses on the night shift.", jobSpecific: false, evidenceIds: ["mercy-ach"] },
        { roleId: "mercy", text: "Precepted new nurses on the night shift.", jobSpecific: true, evidenceIds: ["mercy-ach"] },
        { roleId: "intern", text: "Shipped a clinic intake form during a capstone rotation.", jobSpecific: true, evidenceIds: ["intern-ach"] },
        { roleId: "opentext", text: "Joined a team that will teach me.", jobSpecific: false, evidenceIds: ["no-employer"] },
        { roleId: "mercy", text: "Joined a team that will teach me.", jobSpecific: false, evidenceIds: ["no-employer"] },
        { roleId: "intern", text: "Joined a team that will teach me.", jobSpecific: false, evidenceIds: ["no-employer"] },
      ],
    });
    console.info = info;
    expect(assigned.map((item) => `${item.roleId}:${item.text}`)).toEqual([
      "vmware:Held forecast deviation to 5-10% in FY26.",
      "opentext:Held forecast deviation to 5-10%.",
      "clinic:Precepted new nurses on the night shift.",
      "mercy:Precepted new nurses on the night shift.",
      "intern:Shipped a clinic intake form during a capstone rotation.",
      "opentext:Joined a team that will teach me.",
      "mercy:Joined a team that will teach me.",
      "intern:Joined a team that will teach me.",
    ]);
    expect(assigned.some((item) => item.text.includes("OpenText"))).toBe(false);
    expect(logged.some((line) => line.includes("resume_bullet_candidate_dropped") && line.includes("at OpenText"))).toBe(false);
    const background = groupsFor(salesProfile, [
      bullet("bg", "general", "Joined a team that will teach me.", false),
    ]);
    expect(background.find((group) => group.title === "General background")?.roleId).toBeNull();
    const writer = buildResumeWriterPackage({
      profile: salesProfile,
      bullets: [bullet("bg", "general", "Joined a team that will teach me.", false)],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: null,
      directRoleIds: [],
      planCondensedRoleIds: [],
      asOf,
    });
    expect(writer.requiredStatements.some((item) => item.content.includes("teach me"))).toBe(false);
    expect(writer.backgroundEvidence).toEqual(["Joined a team that will teach me."]);

    const sales = groupsFor(
      {
        ...salesProfile,
        experience: [
          ...salesProfile.experience,
          { id: "vmware", employer: "VMware", title: "Account Executive", endDate: "2024-06" },
        ],
      },
      Array.from({ length: 8 }, (_, index) =>
        bullet(`ot-${index}`, "opentext", "Closed an enterprise deal.", true),
      ),
    );
    expect(sales.find((group) => group.roleId === "opentext")?.items.filter((item) => item.checked)).toHaveLength(7);
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
    expect(nursing.find((group) => group.roleId === "mercy")?.items.filter((item) => item.checked)).toHaveLength(1);
    expect(nursing.find((group) => group.roleId === "clinic")?.items.filter((item) => item.checked)).toHaveLength(3);
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
    expect(graduate[0]?.items.filter((item) => item.checked)).toHaveLength(1);
    expect(applicationAssetConfig.labels.recommendedBulletRange).toBe(
      "Recommended bullets: {min} to {max}.",
    );
    const picker = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    expect(picker).not.toContain("picksOutsideRange");
    expect(picker).not.toContain("{count}");
    expect(picker).toContain("bg-warning-tint");
    expect(picker).toContain("preparingResumeBullets");
    expect(picker).toContain("AppPendingIndicator");
    expect(picker).toContain("router.refresh");
  });

  it("saves a job correction without a paid call and applies it on every application", () => {
    const evidence = [
      { id: "ot-answer", kind: "INTERVIEW_ANSWER" as const, text: "Held forecast deviation to 5-10% at OpenText in FY26.", roleId: null },
      { id: "mercy-ach", kind: "ACHIEVEMENT" as const, text: "Precepted new nurses on the night shift.", roleId: "mercy" },
      { id: "intern-ach", kind: "ACHIEVEMENT" as const, text: "Shipped a clinic intake form.", roleId: "intern" },
    ];
    const bands = [
      { roleId: "opentext", employer: "OpenText", candidateCount: 10 },
      { roleId: "vmware", employer: "VMware", candidateCount: 10 },
      { roleId: "mercy", employer: "Mercy General", candidateCount: 10 },
      { roleId: "intern", employer: "County Hospital", candidateCount: 10 },
    ];
    const bullets = [
      { roleId: "opentext", text: "Held forecast deviation to 5-10% in FY26.", jobSpecific: true, evidenceIds: ["ot-answer"] },
      { roleId: "mercy", text: "Precepted new nurses on the night shift.", jobSpecific: true, evidenceIds: ["mercy-ach"] },
      { roleId: "intern", text: "Shipped a clinic intake form.", jobSpecific: true, evidenceIds: ["intern-ach"] },
    ];
    const otKey = bulletResultKey("Held forecast deviation to 5-10% in FY26.", ["ot-answer"]);
    const mercyKey = bulletResultKey("Precepted new nurses on the night shift.", ["mercy-ach"]);
    const profile = profileWithBulletRoleChoices(
      { experience: salesProfile.experience },
      [otKey],
      "vmware",
    );
    const again = profileWithBulletRoleChoices(profile, [mercyKey], "general");
    const choices = again.bulletRoleChoices as Record<string, string>;
    expect(choices[otKey]).toBe("vmware");
    expect(choices[mercyKey]).toBe("general");
    const nextRun = assignCandidateBullets({ bands, evidence, bullets, choices, roles: bands });
    const otherApplication = assignCandidateBullets({ bands, evidence, bullets, choices, roles: bands });
    expect(nextRun.map((item) => `${item.roleId}:${item.evidenceIds[0]}`)).toEqual(
      otherApplication.map((item) => `${item.roleId}:${item.evidenceIds[0]}`),
    );
    expect(nextRun.find((item) => item.evidenceIds.includes("ot-answer"))?.roleId).toBe("vmware");
    expect(nextRun.find((item) => item.evidenceIds.includes("mercy-ach"))?.roleId).toBe("general");
    expect(nextRun.find((item) => item.evidenceIds.includes("intern-ach"))?.roleId).toBe("intern");
    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const correction = action.slice(
      action.indexOf("export async function saveBulletEvidenceRoleAction"),
      action.indexOf("export async function saveResumeStatementPicksAction"),
    );
    expect(correction).not.toContain("runPaidStructuredCall");
    expect(correction).not.toContain("enqueueApplicationJob");
    expect(correction).toContain("saveBulletEvidenceRole");
    expect(correction).toContain("bulletId");
    expect(correction).not.toContain("evidenceIds");
  });

  it("shows Harper's recommendation, corrects one bullet, and keeps a distinct result", () => {
    const recommended = buildStatementGroups({
      profile: salesProfile,
      bullets: [
        bullet("kept", "opentext", "Closed a $1.3MM Bank of America deal.", false),
        bullet("fresh", "opentext", "Improved forecast deviation from 20% to 5-10%.", false),
        bullet("declined", "opentext", "Ran a VMware campaign that created $3MM in pipeline.", false),
      ],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: ["kept"],
      seenBulletIds: ["kept", "declined"],
      primaryRoleId: "opentext",
      directRoleIds: [],
      asOf,
    });
    const openText = recommended.find((group) => group.roleId === "opentext");
    expect(openText?.items.map((item) => item.recommended)).toEqual([true, true, true]);
    expect(openText?.items.find((item) => item.id === "kept")?.checked).toBe(true);
    expect(openText?.items.find((item) => item.id === "fresh")?.checked).toBe(true);
    expect(openText?.items.find((item) => item.id === "declined")?.checked).toBe(false);
    expect(applicationAssetConfig.labels.harperRecommends).toBe("Harper recommends");
    const picker = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    expect(picker).toContain('data-testid="harper-recommends"');
    expect(picker).toContain("bulletId: item.id");

    const shared = "answer-both";
    const goal = "Led the team to 90%-110% of goal.";
    const sprint = "Closed a Sprint sale.";
    const goalKey = bulletResultKey(goal, [shared]);
    const sprintKey = bulletResultKey(sprint, [shared]);
    expect(goalKey).not.toBe(sprintKey);
    const roles = [
      { roleId: "opentext", employer: salesProfile.experience[0]!.employer ?? "" },
      { roleId: "gryphon", employer: "Gryphon Networks" },
      { roleId: "mercy", employer: nursingProfile.experience[0]!.employer ?? "" },
      { roleId: "micro", employer: "Micro Focus" },
    ];
    const moved = assignCandidateBullets({
      bands: roles.map((role) => ({ ...role, candidateCount: 6 })),
      roles,
      evidence: [
        {
          id: shared,
          kind: "INTERVIEW_ANSWER",
          text: "At OT the team hit 90%-110% of goal, and at Gryphon Networks closed a Sprint sale.",
          roleId: null,
          question: "Tell me about a quota and a sale.",
        },
      ],
      choices: { [sprintKey]: "gryphon" },
      bullets: [
        { roleId: "gryphon", text: goal, jobSpecific: false, evidenceIds: [shared] },
        { roleId: "gryphon", text: sprint, jobSpecific: false, evidenceIds: [shared] },
      ],
    });
    expect(moved.find((item) => item.text === goal)?.roleId).toBe("gryphon");
    expect(moved.find((item) => item.text === sprint)?.roleId).toBe("gryphon");
    expect(
      attributedEvidenceRole(
        {
          id: "ot-short",
          kind: "INTERVIEW_ANSWER",
          text: "Held forecast deviation to 5-10% at OT.",
          roleId: null,
          question: "How close was the forecast?",
        },
        [
          { roleId: "opentext", employer: "OpenText" },
          { roleId: "mercy", employer: "Mercy General" },
        ],
      ),
    ).toBe("opentext");
    expect(
      attributedEvidenceRole(
        {
          id: "ot-ambiguous",
          kind: "INTERVIEW_ANSWER",
          text: "Held the forecast at OT.",
          roleId: null,
          question: null,
        },
        [
          { roleId: "opentext", employer: "OpenText" },
          { roleId: "other", employer: "Oak Terrace" },
        ],
      ),
    ).toBe("general");

    const duplicates = assignCandidateBullets({
      bands: [
        { roleId: "opentext", employer: "OpenText", candidateCount: 6 },
        { roleId: "micro", employer: "Micro Focus", candidateCount: 6 },
      ],
      roles: [
        { roleId: "opentext", employer: "OpenText" },
        { roleId: "micro", employer: "Micro Focus" },
      ],
      evidence: [
        { id: "vm", kind: "INTERVIEW_ANSWER", text: "Ran a VMware campaign that created $3MM in pipeline.", roleId: null, question: "What pipeline did you create?" },
        { id: "boa", kind: "INTERVIEW_ANSWER", text: "Closed a $1.3MM Bank of America deal.", roleId: null, question: "Tell me about a deal at OpenText." },
        { id: "att", kind: "INTERVIEW_ANSWER", text: "Grew a $100K SIEM sale to $1MM in utilization and a $6MM network operations sale.", roleId: null, question: "Tell me about AT&T at Micro Focus." },
        { id: "capstone", kind: "RESUME_BULLET", text: "Shipped a clinic intake form during a capstone.", roleId: null, question: "What did you build in school?" },
      ],
      bullets: [
        { roleId: "opentext", text: "Ran a VMware campaign that created $3MM in pipeline.", jobSpecific: false, evidenceIds: ["vm"] },
        { roleId: "opentext", text: "Created $3MM in pipeline with a VMware campaign.", jobSpecific: true, evidenceIds: ["vm"] },
        { roleId: "opentext", text: "Closed a $1.3MM Bank of America deal.", jobSpecific: false, evidenceIds: ["boa"] },
        { roleId: "general", text: "Closed a $1.3MM Bank of America deal.", jobSpecific: false, evidenceIds: ["boa"] },
        { roleId: "micro", text: "Grew a $100K SIEM sale to $1MM in utilization and a $6MM network operations sale.", jobSpecific: false, evidenceIds: ["att"] },
        { roleId: "general", text: "Shipped a clinic intake form during a capstone.", jobSpecific: false, evidenceIds: ["capstone"] },
      ],
    });
    expect(duplicates.filter((item) => item.text.toLowerCase().includes("vmware"))).toHaveLength(1);
    expect(duplicates.filter((item) => item.text.includes("Bank of America")).map((item) => item.roleId)).toEqual([
      "opentext",
      "general",
    ]);
    expect(duplicates.some((item) => item.text.includes("$100K") && item.text.includes("$6MM"))).toBe(true);
    expect(duplicates.some((item) => item.roleId === "general" && item.text.includes("capstone"))).toBe(true);
    expect(graduateProfile.projectTexts).toContain("Capstone project");
  });

  it("collapses one result per group and follows up when a cited answer's amounts are missing", () => {
    const gsiLong = "Drove GSI and end-customer motions that produced $6.8MM in FY26 revenue.";
    const gsiShort = "Generated $6.8MM in FY26 revenue with GSI.";
    const fullContract =
      "Led a risk-driven enterprise sale of a $1.3MM contract with a $300K upsell for Bank of America.";
    const strategyOnly = "Led executive-level deal strategy for a $1.3MM Bank of America contract.";
    const precept = "Precepted new nurses on the night shift.";
    const preceptRanked = "Precepted new nurses on the night shift for the unit.";
    const capstone = "Shipped a clinic intake form during a capstone.";
    const openTextQuestion = "Tell me about a result at OpenText.";
    const assigned = assignCandidateBullets({
      bands: [
        { roleId: "opentext", employer: salesProfile.experience[0]!.employer ?? "", candidateCount: 8 },
        { roleId: "mercy", employer: nursingProfile.experience[0]!.employer ?? "", candidateCount: 4 },
        { roleId: "intern", employer: "County Hospital", candidateCount: 4 },
      ],
      evidence: [
        { id: "gsi-a", kind: "INTERVIEW_ANSWER", text: `${gsiLong} at OpenText.`, roleId: null, question: openTextQuestion },
        { id: "gsi-b", kind: "INTERVIEW_ANSWER", text: `${gsiShort} at OpenText.`, roleId: null, question: openTextQuestion },
        { id: "deal-a", kind: "INTERVIEW_ANSWER", text: `${fullContract} at OpenText.`, roleId: null, question: openTextQuestion },
        { id: "deal-b", kind: "INTERVIEW_ANSWER", text: `${strategyOnly} at OpenText.`, roleId: null, question: openTextQuestion },
        { id: "mercy-a", kind: "ACHIEVEMENT", text: precept, roleId: "mercy", question: null },
        { id: "mercy-b", kind: "INTERVIEW_ANSWER", text: `${precept} at Mercy General.`, roleId: null, question: "How do you precept new nurses?" },
        { id: "capstone", kind: "RESUME_BULLET", text: capstone, roleId: null, question: "What did you build in school?" },
      ],
      bullets: [
        { roleId: "opentext", text: gsiLong, jobSpecific: false, evidenceIds: ["gsi-a"] },
        { roleId: "opentext", text: gsiShort, jobSpecific: true, evidenceIds: ["gsi-b"] },
        { roleId: "opentext", text: fullContract, jobSpecific: true, evidenceIds: ["deal-a"] },
        { roleId: "opentext", text: strategyOnly, jobSpecific: false, evidenceIds: ["deal-b"] },
        { roleId: "mercy", text: precept, jobSpecific: false, evidenceIds: ["mercy-a"] },
        { roleId: "mercy", text: preceptRanked, jobSpecific: true, evidenceIds: ["mercy-b"] },
        { roleId: "general", text: capstone, jobSpecific: false, evidenceIds: ["capstone"] },
      ],
    });
    expect(assigned.filter((item) => item.text.includes("$6.8MM")).map((item) => item.text)).toEqual([gsiLong]);
    expect(assigned.filter((item) => item.text.includes("$1.3MM")).map((item) => item.text).sort()).toEqual(
      [fullContract, strategyOnly].sort(),
    );
    expect(assigned.filter((item) => item.roleId === "mercy").map((item) => item.text)).toEqual([precept]);
    expect(assigned.some((item) => item.roleId === "general" && item.text === capstone)).toBe(true);
    expect(graduateProfile.projectTexts).toContain("Capstone project");
    const groups = buildStatementGroups({
      profile: {
        experience: [
          ...salesProfile.experience,
          ...nursingProfile.experience,
          { id: "intern", employer: "County Hospital", title: "Nursing Intern", endDate: null },
        ],
        educationTexts: nursingProfile.educationTexts,
        projectTexts: graduateProfile.projectTexts,
      },
      bullets: assigned,
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: "opentext",
      directRoleIds: [],
      asOf,
    });
    const openText = groups.find((group) => group.roleId === "opentext");
    expect(openText?.items.filter((item) => item.content.includes("$6.8MM") && item.recommended)).toHaveLength(1);
    expect(openText?.items.filter((item) => item.content.includes("Bank of America"))).toHaveLength(2);
  });

  it("keeps achievement bullets with their role, drops embedded employer names, and leads with the strongest results", () => {
    const rampText =
      "Hired, trained, and managed account managers, contributing to a minimum year-over-year ARR increase of $9.7 million.";
    const roles = [
      { roleId: "ramp", employer: "RAMP Advertising" },
      { roleId: "gryphon", employer: "Gryphon Networks" },
      { roleId: "opentext", employer: "OpenText" },
      { roleId: "loginvsi", employer: "Login VSI" },
      { roleId: "merion", employer: "Merion Publications" },
    ];
    const bands = roles.map((role) => ({ ...role, candidateCount: 4 }));
    const evidence = [
      { id: "ramp-ach", kind: "ACHIEVEMENT" as const, text: rampText, roleId: "ramp", question: null },
      {
        id: "ot-question",
        kind: "INTERVIEW_ANSWER" as const,
        text: "Closed a multi-threaded $1.3MM deal with Bank of America and AT&T.",
        roleId: null,
        question: "Tell me about a deal you closed at OpenText.",
      },
      {
        id: "either-company",
        kind: "SEEKER_REPLY" as const,
        text: "Closed a multi-threaded deal with a national bank.",
        roleId: null,
        question: "Was this at OpenText or Login VSI?",
      },
      {
        id: "possessive",
        kind: "INTERVIEW_ANSWER" as const,
        text: "Built the enterprise forecasting practice.",
        roleId: null,
        question: "What did you build at OpenText?",
      },
    ];
    const logged: string[] = [];
    const info = console.info;
    console.info = (message?: unknown) => {
      if (typeof message === "string") logged.push(message);
    };
    const assigned = assignCandidateBullets({
      bands,
      roles,
      evidence,
      bullets: [
        {
          roleId: "gryphon",
          text: "Hired, trained, and managed Gryphon Networks account managers, contributing to a minimum year-over-year ARR increase of $9.7 million.",
          jobSpecific: true,
          evidenceIds: ["ramp-ach"],
        },
        {
          roleId: "gryphon",
          text: "Built OpenText's enterprise forecasting practice for Bank of America and AT&T.",
          jobSpecific: false,
          evidenceIds: ["possessive"],
        },
        {
          roleId: "ramp",
          text: "Closed a multi-threaded $1.3MM deal with Bank of America and AT&T.",
          jobSpecific: false,
          evidenceIds: ["ot-question"],
        },
        {
          roleId: "opentext",
          text: "Closed a multi-threaded deal with a national bank.",
          jobSpecific: true,
          evidenceIds: ["either-company"],
        },
        {
          roleId: "opentext",
          text: "Merion Publications grew the magazine group.",
          jobSpecific: false,
          evidenceIds: ["either-company"],
        },
        {
          roleId: "opentext",
          text: "Led Gryphon Networks account managers on a national team.",
          jobSpecific: true,
          evidenceIds: ["ot-question"],
        },
      ],
    });
    console.info = info;
    const ramp = assigned.find((item) => item.evidenceIds.includes("ramp-ach"));
    expect(ramp?.roleId).toBe("gryphon");
    expect(ramp?.text).toBe(rampText);
    expect(ramp?.text.toLowerCase().includes("gryphon")).toBe(false);
    const possessive = assigned.find((item) => item.evidenceIds.includes("possessive"));
    expect(possessive?.roleId).toBe("gryphon");
    expect(possessive?.text).toBe(
      "Built enterprise forecasting practice for Bank of America and AT&T.",
    );
    expect(possessive?.text.includes("OpenText")).toBe(false);
    const fromQuestion = assigned.find((item) => item.evidenceIds.includes("ot-question"));
    expect(fromQuestion?.roleId).toBe("ramp");
    expect(fromQuestion?.text).toContain("Bank of America");
    expect(fromQuestion?.text).toContain("AT&T");
    expect(
      assigned.find((item) => item.text === "Closed a multi-threaded deal with a national bank.")
        ?.roleId,
    ).toBe("opentext");
    expect(assigned.some((item) => item.text === "grew the magazine group.")).toBe(true);
    expect(assigned.some((item) => item.text.includes("Merion"))).toBe(false);
    expect(assigned.some((item) => item.text === "Led account managers on a national team.")).toBe(true);
    expect(assigned.some((item) => item.text.includes("Gryphon"))).toBe(false);
    expect(
      logged.some(
        (line) =>
          line.includes("resume_bullet_candidate_dropped") &&
          line.includes("Led Gryphon Networks account managers"),
      ),
    ).toBe(false);
    expect(attributedEvidenceRole(evidence[1]!, roles)).toBe("opentext");
    expect(attributedEvidenceRole(evidence[2]!, roles)).toBe("general");
    expect(
      questionTextForAnswer({
        turns: [
          {
            id: "q-ot",
            speaker: "CONSULTANT",
            body: "Tell me about a deal you closed at OpenText.",
            sequence: 1,
            targetKey: "required:deal",
          },
          {
            id: "a-ot",
            speaker: "SEEKER",
            body: "Closed a multi-threaded deal.",
            sequence: 2,
            targetKey: "required:deal",
            analysisJson: { replyToTurnId: "q-ot" },
          },
        ],
        turnId: "a-ot",
      }),
    ).toBe("Tell me about a deal you closed at OpenText.");
    const withQuestion = selectableBulletEvidence({
      campaignId: "sift",
      achievements: [],
      statements: [
        {
          id: "stmt-ot",
          content: "Closed a multi-threaded deal.",
          kind: "INTERVIEW_ANSWER",
          campaignId: "sift",
          targetKey: "required:deal",
          question: "Tell me about a deal you closed at OpenText.",
        },
      ],
      replies: [],
    });
    const messages = buildResumeBulletCandidateMessages({
      roles: [{ roleId: "opentext", employer: "OpenText", title: "Account Executive", candidateCount: 4 }],
      evidence: withQuestion,
      job: { title: "Account Executive", employer: "Sift", posting: "Own the forecast." },
    });
    expect(messages[0]?.content.startsWith("Prompt version: 7")).toBe(true);
    expect(JSON.parse(messages[1]?.content ?? "{}").evidence[0].question).toContain("OpenText");
    const prepare = readFileSync("src/lib/application-assets/resume-bullet-candidate-service.ts", "utf8");
    const provider = prepare.slice(prepare.indexOf("callProvider: async"));
    expect(prepare.indexOf("runPaidStructuredCall")).toBeLessThan(prepare.indexOf("callProvider: async"));
    expect(provider).not.toContain("employerRetryDecision");
    expect(provider).not.toContain("employerNameRetryMessage()");
    expect(provider).not.toContain("mergeEmployerNameRetry");
    expect(provider).not.toContain("uncoveredResultFollowUpMessage");
    expect(provider).not.toContain("resume_bullet_candidates_follow_up");
    expect(prepare).toContain("evidenceNotCovered");
    expect(provider).toContain("replaceUnpickedCandidates");
    expect(provider).not.toContain("[...previousBullets, ...added]");

    const strong = [
      { id: "jd", text: "Partnered with marketing on demand generation.", jobSpecific: true },
      { id: "boa", text: "Closed a multi-threaded $1.3MM Bank of America deal.", jobSpecific: false },
      { id: "forecast", text: "Improved forecast deviation from 20% to 5-10%.", jobSpecific: false },
      { id: "revenue", text: "Delivered $6.8MM in FY26 revenue, including $3.5MM in new enterprise.", jobSpecific: false },
      { id: "vmware", text: "Ran a VMware campaign that created $3MM in pipeline.", jobSpecific: false },
      { id: "jd2", text: "Supported the posted sales process.", jobSpecific: true },
    ];
    const ranked = assignCandidateBullets({
      bands: [{ roleId: "opentext", employer: "OpenText", candidateCount: 4 }],
      roles: [{ roleId: "opentext", employer: "OpenText" }],
      evidence: strong.map((item) => ({
        id: item.id,
        kind: "ACHIEVEMENT" as const,
        text: item.text,
        roleId: "opentext",
        question: null,
      })),
      bullets: strong.map((item) => ({
        roleId: "opentext",
        text: item.text,
        jobSpecific: item.jobSpecific,
        evidenceIds: [item.id],
      })),
    });
    expect(ranked.map((item) => item.text)).toEqual(strong.map((item) => item.text));
    const recommended = groupsFor(salesProfile, ranked.map((item, index) => ({
      ...item,
      id: strong.filter((row) => item.text === row.text)[0]?.id ?? `ranked-${index}`,
    })));
    const openText = recommended.find((group) => group.roleId === "opentext");
    expect(openText?.items.slice(0, 4).every((item) => item.checked)).toBe(true);
    expect(openText?.items[0]?.content).toContain("Partnered with marketing");
    expect(applicationAssetConfig.labels.refreshBullets).toBe("Refresh bullets");
    expect(applicationAssetConfig.labels.checkTheJob).toBe("Check the job");
    const assets = readFileSync("src/components/ApplicationAssetsSection.tsx", "utf8");
    expect(assets).not.toContain("preparingBullets={generating}");
    const picker = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    expect(picker).toContain("refreshBullets");
    expect(picker).toContain("check-the-job");
    expect(picker).toContain("router.refresh");
  });

  it("uses the whole library, keeps every stated result, and matches a shorter employer name", () => {
    const employers = [
      salesProfile.experience[0]!.employer!,
      nursingProfile.experience[0]!.employer!,
    ];
    expect(employers).toEqual(["OpenText", "Mercy General"]);
    const evidence = selectableBulletEvidence({
      campaignId: "sift",
      profileEmployers: employers,
      achievements: [
        {
          id: "ach-ot",
          text: "Closed a multi-threaded $1.3MM Bank of America deal.",
          roleId: "opentext",
        },
      ],
      statements: [
        {
          id: "library-deal",
          content: "Closed a multi-threaded $1.3MM Bank of America deal.",
          kind: "INTERVIEW_ANSWER",
          campaignId: "csc",
          targetKey: "required:deal",
          question: "Tell me about a deal you closed at OpenText.",
          sourceEmployer: "CSC",
        },
        {
          id: "library-why",
          content: "I want to join CSC because of its domain-security work.",
          kind: "INTERVIEW_ANSWER",
          campaignId: "csc",
          targetKey: "why-this-company",
          question: "Why do you want to work at CSC?",
          sourceEmployer: "CSC",
          whyThisCompany: "I want to join CSC because of its domain-security work.",
        },
        {
          id: "library-plan",
          content: "A 90-day plan for CSC.",
          kind: "RESUME_BULLET",
          campaignId: "csc",
          targetKey: "required:plan",
          question: "What is your 90-day plan for CSC?",
          sourceEmployer: "CSC",
        },
        {
          id: "library-nursing",
          content: "Precepted 8 new nurses on the night shift.",
          kind: "INTERVIEW_ANSWER",
          campaignId: "city-hospital",
          targetKey: "required:precept",
          question: "How do you precept new nurses?",
          sourceEmployer: "City Hospital",
        },
        {
          id: "library-capstone",
          content: "Shipped 1 clinic intake form during a capstone.",
          kind: "RESUME_BULLET",
          campaignId: "northwind",
          targetKey: null,
          question: "What did you build in school?",
          sourceEmployer: "Northwind",
        },
      ],
      replies: [
        { id: "reply-csc", body: "I wrote this for CSC.", campaignId: "csc" },
      ],
    });
    expect(evidence.map((item) => item.id)).toEqual([
      "library-deal",
      "library-nursing",
      "library-capstone",
      "ach-ot",
    ]);
    expect(evidence[0]?.kind).toBe("INTERVIEW_ANSWER");
    expect(evidence[0]?.question).toBe("Tell me about a deal you closed at OpenText.");
    expect(evidence.findIndex((item) => item.kind === "ACHIEVEMENT")).toBe(3);
    expect(JSON.stringify(evidence)).not.toContain("90-day plan");
    expect(JSON.stringify(evidence)).not.toContain("domain-security");
    expect(graduateProfile.projectTexts).toContain("Capstone project");

    const messages = buildResumeBulletCandidateMessages({
      roles: [
        { roleId: "opentext", employer: "OpenText", title: "Account Executive", candidateCount: 14 },
        { roleId: "mercy", employer: "Mercy General", title: "Registered Nurse", candidateCount: 10 },
      ],
      evidence,
      job: { title: "Account Executive", employer: "Sift", posting: "Own the forecast." },
    });
    expect(messages[0]?.content).toContain("set needsJobCheck to true");
    const sent = JSON.parse(messages[1]?.content ?? "{}") as { evidence: Array<{ id: string }> };
    expect(sent.evidence[0]?.id).toBe("library-deal");
    expect(sent.evidence.map((item) => item.id).indexOf("ach-ot")).toBeGreaterThan(0);

    const pickedText = "Held forecast deviation to 5-10%.";
    const draftText = "Closed a $2MM deal.";
    const editedText = "Coached the team to close a $2MM deal.";
    const replaced = replaceUnpickedCandidates({
      employers,
      kept: [
        {
          text: pickedText,
          evidenceIds: ["ot"],
          resultKey: bulletResultKey(pickedText, ["ot"]),
        },
        {
          text: editedText,
          evidenceIds: ["deal"],
          resultKey: bulletResultKey(draftText, ["deal"]),
        },
      ],
      previous: [
        { text: pickedText, evidenceIds: ["ot"] },
        { text: draftText, evidenceIds: ["deal"] },
        { text: "Ran a VMware campaign that created $3MM in pipeline.", evidenceIds: ["vm"] },
      ],
      next: [
        { text: pickedText, evidenceIds: ["ot"] },
        { text: "Built a $4MM pipeline with a partner campaign.", evidenceIds: ["vm"] },
        { text: "Opened a $1MM logo.", evidenceIds: ["logo"] },
      ],
    });
    expect(replaced.map((item) => item.text)).toEqual([
      pickedText,
      draftText,
      "Built a $4MM pipeline with a partner campaign.",
      "Opened a $1MM logo.",
    ]);

    const stripped = assignCandidateBullets({
      bands: [{ roleId: "mercy", employer: "Mercy General", candidateCount: 4 }],
      roles: [{ roleId: "mercy", employer: "Mercy General" }],
      evidence: [
        {
          id: "library-nursing",
          kind: "INTERVIEW_ANSWER",
          text: "Precepted new nurses at Mercy General.",
          roleId: null,
          question: "How do you precept new nurses at Mercy General?",
        },
      ],
      bullets: [
        {
          roleId: "mercy",
          text: "Precepted new nurses at Mercy General during the night shift.",
          jobSpecific: true,
          evidenceIds: ["library-nursing"],
        },
      ],
    });
    expect(stripped[0]?.roleId).toBe("mercy");
    expect(stripped[0]?.text).toBe("Precepted new nurses during the night shift.");
    expect(stripped[0]?.text.includes("Mercy")).toBe(false);

    const microFocus = [{ roleId: "micro-focus", employer: "Micro Focus (acquired by OpenText)" }];
    expect(
      attributedEvidenceRole(
        {
          id: "mf",
          kind: "INTERVIEW_ANSWER",
          text: "Closed the Micro Focus renewal.",
          roleId: null,
          question: "Tell me about a renewal.",
        },
        microFocus,
      ),
    ).toBe("micro-focus");
    expect(
      attributedEvidenceRole(
        {
          id: "mf-ambiguous",
          kind: "INTERVIEW_ANSWER",
          text: "Closed the Micro Focus renewal.",
          roleId: null,
          question: null,
        },
        [
          { roleId: "micro-focus", employer: "Micro Focus (acquired by OpenText)" },
          { roleId: "micro-focus-short", employer: "Micro Focus" },
        ],
      ),
    ).toBe("general");
    expect(
      attributedEvidenceRole(
        {
          id: "capstone",
          kind: "RESUME_BULLET",
          text: "Shipped a clinic intake form during a capstone.",
          roleId: null,
          question: "What did you build in school?",
        },
        microFocus,
      ),
    ).toBe("general");
    const placed = assignCandidateBullets({
      bands: [{ roleId: "micro-focus", employer: "Micro Focus (acquired by OpenText)", candidateCount: 4 }],
      roles: microFocus,
      evidence: [
        {
          id: "mf",
          kind: "INTERVIEW_ANSWER",
          text: "Closed the Micro Focus renewal.",
          roleId: null,
          question: "Tell me about a renewal.",
        },
      ],
      bullets: [
        {
          roleId: "general",
          text: "Closed the Micro Focus renewal.",
          jobSpecific: false,
          evidenceIds: ["mf"],
        },
      ],
    });
    expect(placed[0]?.roleId).toBe("general");
    expect(placed[0]?.text).toBe("Closed the renewal.");
    expect(placed[0]?.text.includes("Micro Focus")).toBe(false);
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

describe("resume bullet style, date order, and seeker edits", () => {
  const style = "Do not name the employer; the job heading shows it. Customer and partner names are fine.";
  const summarySentence =
    "Write the summary in two or three sentences that name the seeker's strongest stated results, with their numbers, before describing skills or methods.";

  it("shows Check the job and does not pre-check until the seeker confirms the job", () => {
    const evidence = [
      {
        id: "ev-deal",
        kind: "INTERVIEW_ANSWER" as const,
        text: "Closed a $2MM deal.",
        roleId: null,
        question: null,
      },
    ];
    const bands = [{ roleId: "opentext", employer: "OpenText", candidateCount: 7 }];
    const assigned = assignCandidateBullets({
      bands,
      evidence,
      bullets: [
        {
          roleId: "opentext",
          text: "Closed a $2MM deal.",
          evidenceIds: ["ev-deal"],
          needsJobCheck: true,
        },
      ],
    });
    const open = groupsFor(salesProfile, assigned).find((group) => group.roleId === "opentext");
    expect(open?.items[0]?.needsJobCheck).toBe(true);
    expect(open?.items[0]?.checked).toBe(false);
    const confirmed = assignCandidateBullets({
      bands,
      evidence,
      choices: { [assigned[0]!.resultKey ?? ""]: "opentext" },
      bullets: [
        {
          roleId: "opentext",
          text: "Closed a $2MM deal.",
          evidenceIds: ["ev-deal"],
          needsJobCheck: true,
        },
      ],
    });
    const confirmedItem = groupsFor(salesProfile, confirmed).find((group) => group.roleId === "opentext")
      ?.items[0];
    expect(confirmedItem?.needsJobCheck).toBe(false);
    expect(confirmedItem?.checked).toBe(true);
    expect(applicationAssetConfig.labels.checkTheJob).toBe("Check the job");
  });

  it("splits one answer that names two employers and keeps each result on its own bullet", () => {
    const roles = [
      { roleId: "opentext", employer: salesProfile.experience[0]!.employer! },
      { roleId: "micro", employer: "Micro Focus" },
      { roleId: "gryphon", employer: "Gryphon Networks" },
      { roleId: "mercy", employer: nursingProfile.experience[0]!.employer! },
      { roleId: "intern", employer: "County Hospital" },
    ];
    const segments = splitEvidenceByEmployer(
      [
        {
          id: "deals",
          kind: "INTERVIEW_ANSWER" as const,
          text: "I have closed up to $6.8MM (AT&T - at Microfocus as a sales rep). My largest deal was Sprint as a seller at Gryphon Networks, worth $12 million. The close took one quarter.",
          roleId: null,
          question: "What results are you proud of?",
        },
        {
          id: "mercy-ach",
          kind: "ACHIEVEMENT" as const,
          text: "Precepted new nurses on the night shift at Mercy General.",
          roleId: "mercy",
          question: null,
        },
        {
          id: "intern-ach",
          kind: "ACHIEVEMENT" as const,
          text: "Shipped a clinic intake form.",
          roleId: "intern",
          question: null,
        },
      ],
      roles,
    );
    const deals = segments.filter((item) => item.id === "deals");
    expect(deals).toHaveLength(2);
    expect(deals.every((item) => item.question === "What results are you proud of?")).toBe(true);
    expect(deals[0]?.text).toContain("$6.8MM");
    expect(deals[0]?.text).toContain("Microfocus");
    expect(deals[1]?.text).toContain("Gryphon Networks");
    expect(deals[1]?.text).toContain("one quarter");
    expect(segments.filter((item) => item.id === "mercy-ach")).toHaveLength(1);
    expect(segments.filter((item) => item.id === "intern-ach")).toHaveLength(1);
    const placed = assignCandidateBullets({
      bands: roles
        .filter((role) => role.roleId !== "opentext")
        .map((role) => ({ ...role, candidateCount: 4 })),
      roles,
      evidence: segments,
      bullets: [
        {
          roleId: "gryphon",
          text: "Closed up to $6.8 million with AT&T.",
          jobSpecific: true,
          evidenceIds: ["deals"],
        },
        {
          roleId: "gryphon",
          text: "Secured Sprint's $12 million agreement.",
          jobSpecific: true,
          evidenceIds: ["deals"],
        },
        {
          roleId: "mercy",
          text: "Precepted new nurses on the night shift.",
          jobSpecific: true,
          evidenceIds: ["mercy-ach"],
        },
        {
          roleId: "intern",
          text: "Shipped a clinic intake form.",
          jobSpecific: false,
          evidenceIds: ["intern-ach"],
        },
      ],
    });
    const att = placed.find((item) => item.text.includes("6.8"));
    const sprint = placed.find((item) => item.text.includes("12 million"));
    expect(att?.roleId).toBe("gryphon");
    expect(sprint?.roleId).toBe("gryphon");
    expect(att?.text.includes("12 million")).toBe(false);
    expect(sprint?.text.includes("6.8")).toBe(false);
    expect(placed.filter((item) => item.text.includes("6.8") && item.text.includes("12"))).toHaveLength(0);
    expect(placed.find((item) => item.evidenceIds.includes("mercy-ach"))?.roleId).toBe("mercy");
    expect(placed.find((item) => item.evidenceIds.includes("intern-ach"))?.text).toBe(
      "Shipped a clinic intake form.",
    );
  });

  it("keeps the approved bullet and summary sentences, and orders roles most recent first", () => {
    expect(RESUME_BULLET_CANDIDATE_INSTRUCTIONS.indexOf(style)).toBeGreaterThan(
      RESUME_BULLET_CANDIDATE_INSTRUCTIONS.indexOf("Facts:"),
    );
    expect(RESUME_ASSET_INSTRUCTIONS.indexOf(summarySentence)).toBeGreaterThan(
      RESUME_ASSET_INSTRUCTIONS.indexOf("Write a concise job-specific summary."),
    );
    const profile: PickerProfile = {
      experience: [
        {
          id: "gryphon",
          employer: "Gryphon Networks",
          title: "Seller",
          startDate: "2010-03",
          endDate: "2014-06",
        },
        {
          id: "undated",
          employer: "Independent",
          title: "Advisor",
          startDate: null,
          endDate: "undated",
        },
        {
          id: "checkpoint",
          employer: "Checkpoint Technologies",
          title: "Account Executive",
          startDate: "2014-07",
          endDate: "2015-12",
        },
        {
          id: "same-end-early",
          employer: "Early Start Co",
          title: "Representative",
          startDate: "2008-01",
          endDate: "2014-06",
        },
        {
          id: "opentext",
          employer: salesProfile.experience[0]!.employer,
          title: salesProfile.experience[0]!.title,
          startDate: "2024-02",
          endDate: null,
        },
        {
          id: "mercy",
          employer: nursingProfile.experience[0]!.employer,
          title: nursingProfile.experience[0]!.title,
          startDate: "2022-06",
          endDate: null,
        },
        {
          id: "intern",
          employer: "County Hospital",
          title: "Nursing Intern",
          startDate: null,
          endDate: null,
        },
      ],
      educationTexts: nursingProfile.educationTexts,
      projectTexts: graduateProfile.projectTexts,
    };
    const expected = ["opentext", "mercy", "intern", "checkpoint", "gryphon", "same-end-early", "undated"];
    expect(roleBulletBands({
      profile,
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      primaryRoleId: null,
      directRoleIds: [],
      asOf,
    }).map((band) => band.roleId)).toEqual(expected);
    expect(orderRolesMostRecentFirst(profile.experience).map((role) => role.id)).toEqual(expected);
    const claim = (id: string, text: string) => ({
      id,
      text,
      supports: [{ sourceId: "profile:name", quote: "Ada" }],
    });
    const resume = resumeWithExactPickedBullets(
      {
        type: "RESUME",
        header: { name: claim("name", "Ada"), contactDetails: [] },
        summary: [claim("summary", "Account executive.")],
        experience: profile.experience.map((role) => ({
          roleId: role.id,
          employer: role.employer ?? "",
          title: role.title ?? "",
          startDate: role.startDate ?? null,
          endDate: role.endDate,
          location: null,
          hidden: false,
          condensed: false,
          bullets: [],
        })),
        skills: [],
        education: [],
        credentials: [],
      },
      [],
      "profile:name",
    );
    expect(resume.experience.map((role) => role.roleId)).toEqual(expected);
  });

  it("keeps a seeker's bullet edit through refresh, the resume, and the citation check", () => {
    const evidence = [
      {
        id: "ot-answer",
        kind: "INTERVIEW_ANSWER" as const,
        text: "Held forecast deviation to 5-10% at OpenText.",
        roleId: null,
        question: "How did you run the forecast?",
      },
      {
        id: "mercy-ach",
        kind: "ACHIEVEMENT" as const,
        text: "Precepted new nurses on the night shift.",
        roleId: "mercy",
        question: null,
      },
      {
        id: "intern-ach",
        kind: "ACHIEVEMENT" as const,
        text: "Shipped a clinic intake form.",
        roleId: "intern",
        question: null,
      },
    ];
    const bands = [
      { roleId: "opentext", employer: "OpenText", candidateCount: 4 },
      { roleId: "mercy", employer: "Mercy General", candidateCount: 4 },
      { roleId: "intern", employer: "County Hospital", candidateCount: 4 },
    ];
    const drafts = [
      {
        roleId: "opentext",
        text: "Held forecast deviation to 5-10%.",
        jobSpecific: true,
        evidenceIds: ["ot-answer"],
      },
      {
        roleId: "mercy",
        text: "Precepted new nurses on the night shift.",
        jobSpecific: true,
        evidenceIds: ["mercy-ach"],
      },
      {
        roleId: "intern",
        text: "Shipped a clinic intake form.",
        jobSpecific: false,
        evidenceIds: ["intern-ach"],
      },
    ];
    const nursingDraft = "Precepted new nurses on the night shift.";
    const edited = "Precepted four new nurses on the night shift.";
    const nursingKey = bulletResultKey(nursingDraft, ["mercy-ach"]);
    const first = assignCandidateBullets({ bands, evidence, bullets: drafts, roles: bands });
    const stored = profileWithBulletTextEdits(
      profileWithBulletRoleChoices(emptyCandidateProfile(), [
        bulletResultKey("Held forecast deviation to 5-10%.", ["ot-answer"]),
      ], "opentext"),
      nursingKey,
      edited,
    );
    const parsed = parseCandidateProfileSafe(stored);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.profile.bulletTextEdits?.[nursingKey]).toBe(edited);
    expect(parsed.profile.bulletRoleChoices).toBeTruthy();
    const edits = readBulletTextEdits(stored);
    const shown = applyBulletTextEdits(first, edits);
    const refreshed = applyBulletTextEdits(
      assignCandidateBullets({ bands, evidence, bullets: drafts, roles: bands }),
      edits,
    );
    const nursing = refreshed.find((item) => item.evidenceIds.includes("mercy-ach"));
    expect(nursing?.text).toBe(edited);
    expect(nursing?.id).toBe(shown.find((item) => item.evidenceIds.includes("mercy-ach"))?.id);
    expect(refreshed.find((item) => item.evidenceIds.includes("ot-answer"))?.text).toBe(
      "Held forecast deviation to 5-10%.",
    );
    expect(refreshed.find((item) => item.evidenceIds.includes("intern-ach"))?.text).toBe(
      "Shipped a clinic intake form.",
    );
    expect(bulletEditEvidence(edits).some((item) => item.kind === "SEEKER_REPLY" && item.text === edited)).toBe(
      true,
    );
    const writer = buildResumeWriterPackage({
      profile: {
        experience: [
          { id: "opentext", employer: "OpenText", title: "Account Executive", endDate: null },
          { id: "mercy", employer: "Mercy General", title: "Registered Nurse", endDate: null },
          { id: "intern", employer: "County Hospital", title: "Nursing Intern", endDate: null },
        ],
        educationTexts: nursingProfile.educationTexts,
        projectTexts: graduateProfile.projectTexts,
      },
      bullets: refreshed,
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: nursing ? [nursing.id] : [],
      seenBulletIds: refreshed.map((item) => item.id),
      primaryRoleId: null,
      directRoleIds: [],
      planCondensedRoleIds: [],
      asOf,
    });
    expect(writer.requiredStatements.find((item) => item.roleId === "mercy")?.content).toBe(edited);
    const claim = (id: string, text: string) => ({
      id,
      text,
      supports: [{ sourceId: "profile:name", quote: "Ada" }],
    });
    const sources = [
      { id: "profile:name", category: "PROFILE_FACT", text: "Ada Lovelace" },
      { id: `bullet-edit:${nursingKey}`, category: "SEEKER_REPLY", text: edited },
    ];
    const resume = resumeWithExactPickedBullets(
      {
        type: "RESUME",
        header: { name: claim("name", "Ada"), contactDetails: [] },
        summary: [claim("summary", "Nurse and seller.")],
        experience: [
          {
            roleId: "mercy",
            employer: "Mercy General",
            title: "Registered Nurse",
            startDate: "2022-06",
            endDate: null,
            location: null,
            hidden: false,
            condensed: false,
            bullets: [claim("old", "A draft the seeker replaced.")],
          },
        ],
        skills: [],
        education: [],
        credentials: [],
      },
      [{ statementId: nursing?.id ?? "missing", roleId: "mercy", content: edited }],
      "profile:name",
      sources,
    );
    expect(resume.experience[0]?.bullets[0]?.text).toBe(edited);
    expect(resume.experience[0]?.bullets[0]?.supports[0]?.sourceId).toBe(`bullet-edit:${nursingKey}`);
    const context = { sources, assessments: [] } as unknown as ReadyApplicationGenerationContext;
    expect(resumeClaimCitationErrors(resume, context)).toEqual([]);
    const action = readFileSync("src/app/actions/application-assets.ts", "utf8");
    const save = action.slice(
      action.indexOf("export async function saveBulletTextAction"),
      action.indexOf("export async function saveResumeStatementPicksAction"),
    );
    expect(save).toContain("saveBulletText");
    expect(save).not.toContain("runPaidStructuredCall");
    expect(save).not.toContain("enqueueApplicationJob");
    const picker = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    const rowStart = picker.indexOf("data-testid={`bullet-actions-${item.id}`}");
    const row = picker.slice(rowStart, picker.indexOf("</span>", rowStart));
    expect(row).toContain('aria-label="Job"');
    expect(row).toContain("editBullet");
    expect(row).toContain("saveBullet");
    expect(picker).toContain("saveBulletTextAction");
    expect(picker).toContain("focus({ preventScroll: true })");
  });
});

describe("role date order for every seeker date format", () => {
  function role(
    id: string,
    employer: string,
    startDate: string | null,
    endDate: string | null,
  ) {
    return { id, employer, title: employer, startDate, endDate };
  }

  it("sorts the reported profile and every common date format", () => {
    const reported = [
      role("opentext", "OpenText", "Dec 2022", "Present"),
      role("checkpoint", "Checkpoint Technologies", "2014", "2015"),
      role("gryphon", "Gryphon Networks", "2010", "2014"),
      role("ramp", "RAMP Advertising", "2006", "2010"),
      role("merion", "Merion Publications", "2002", "2006"),
      role("mda", "Marketing Database Associates", "1997", "2002"),
      role("aerotek", "Aerotek", "1994", "1996"),
      role("login", "Login VSI", "December 2021", "Dec 2022"),
      role("micro", "Micro Focus", "Apr 2015", "Dec 2021"),
    ];
    const expected = [
      "opentext",
      "login",
      "micro",
      "checkpoint",
      "gryphon",
      "ramp",
      "merion",
      "mda",
      "aerotek",
    ];
    expect(orderRolesMostRecentFirst(reported).map((item) => item.id)).toEqual(expected);
    const profile: PickerProfile = {
      experience: reported,
      educationTexts: nursingProfile.educationTexts,
      projectTexts: graduateProfile.projectTexts,
    };
    expect(
      roleBulletBands({
        profile,
        settings: DEFAULT_HARPER_DRAFT_SETTINGS,
        primaryRoleId: null,
        directRoleIds: [],
        asOf,
      }).map((band) => band.roleId),
    ).toEqual(expected);
    const claim = (id: string, text: string) => ({
      id,
      text,
      supports: [{ sourceId: "profile:name", quote: "Ada" }],
    });
    const resume = resumeWithExactPickedBullets(
      {
        type: "RESUME",
        header: { name: claim("name", "Ada"), contactDetails: [] },
        summary: [],
        experience: reported.map((item) => ({
          roleId: item.id,
          employer: item.employer,
          title: item.title,
          startDate: item.startDate,
          endDate: item.endDate,
          location: null,
          hidden: false,
          condensed: false,
          bullets: [],
        })),
        skills: [],
        education: [],
        credentials: [],
      },
      [],
      "profile:name",
    );
    expect(resume.experience.map((item) => item.roleId)).toEqual(expected);

    const formats = orderRolesMostRecentFirst([
      role("year", "Year only", "2014", "2014"),
      role("abbr", "Abbreviation", "Dec 2022", "Dec 2022"),
      role("full", "Full month", "December 2021", "December 2021"),
      role("sept", "September abbreviation", "Sept 2019", "Sept 2019"),
      role("iso", "Numeric month", "2021-03", "2021-03"),
      role("slash", "Slash month", "03/2021", "03/2021"),
      role("slash-short", "Short slash month", "3/2021", "3/2021"),
      role("present", "Present", "2010", "Present"),
      role("current", "Current", "2011", "Current"),
      role("now", "Now", "2012", "Now"),
      role("undated", "No year", "undated", "n/a"),
    ]);
    expect(formats.map((item) => item.id)).toEqual([
      "now",
      "current",
      "present",
      "abbr",
      "full",
      "iso",
      "slash",
      "slash-short",
      "sept",
      "year",
      "undated",
    ]);

    const docx = readFileSync("src/lib/application-assets/docx.ts", "utf8");
    const writer = readFileSync("src/lib/application-assets/prompt.ts", "utf8");
    const picker = readFileSync("src/lib/application-assets/resume-statement-picks.ts", "utf8");
    expect(docx).toContain("orderRolesMostRecentFirst");
    expect(writer).toContain("orderRolesMostRecentFirst");
    expect(picker).toContain("orderRolesMostRecentFirst(profile.experience)");
  });

  it("leaves a job off the resume, keeps an added seeker bullet, and shows profile achievements when a job is empty", () => {
    const openTextAchievement = "Closed a $1.3MM Bank of America deal.";
    const mercyAchievement = "Precepted 8 new nurses on the night shift.";
    const capstoneAchievement = "Shipped a clinic intake form during a capstone.";
    const profile: PickerProfile = {
      experience: [
        {
          id: "opentext",
          employer: "OpenText",
          title: "Account Executive",
          endDate: null,
          achievements: [openTextAchievement],
        },
        {
          id: "mercy",
          employer: "Mercy General",
          title: "Registered Nurse",
          endDate: null,
          achievements: [mercyAchievement],
        },
        {
          id: "intern",
          employer: "County Hospital",
          title: "Nursing Intern",
          endDate: null,
          achievements: [capstoneAchievement],
        },
        {
          id: "legacy",
          employer: salesProfile.experience[1]!.employer,
          title: salesProfile.experience[1]!.title,
          endDate: "2004-06",
          achievements: ["Kept an old territory."],
        },
      ],
      educationTexts: nursingProfile.educationTexts,
      projectTexts: graduateProfile.projectTexts,
    };
    const stored = { seekerBullets: [] };

    const emptyGroups = buildStatementGroups({
      profile,
      bullets: [],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: "opentext",
      directRoleIds: [],
      hiddenRoleIds: ["legacy"],
      asOf,
    });
    const openText = emptyGroups.find((group) => group.roleId === "opentext");
    const mercy = emptyGroups.find((group) => group.roleId === "mercy");
    const intern = emptyGroups.find((group) => group.roleId === "intern");
    const legacy = emptyGroups.find((group) => group.roleId === "legacy");
    expect(openText?.items.map((item) => item.content)).toEqual([openTextAchievement]);
    expect(mercy?.items.map((item) => item.content)).toEqual([mercyAchievement]);
    expect(intern?.items.map((item) => item.content)).toEqual([capstoneAchievement]);
    expect(openText?.items[0]?.recommended).toBe(true);
    expect(mercy?.items[0]?.recommended).toBe(true);
    expect(intern?.items[0]?.recommended).toBe(true);
    expect(legacy?.leftOff).toBe(true);
    expect(legacy?.items).toEqual([]);
    expect(graduateProfile.projectTexts).toContain("Capstone project");

    const withCandidate = buildStatementGroups({
      profile,
      bullets: [
        {
          id: "candidate-mercy",
          roleId: "mercy",
          text: "A drafted mercy bullet.",
          evidenceIds: ["mercy-answer"],
        },
      ],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: "opentext",
      directRoleIds: [],
      asOf,
    });
    expect(
      withCandidate.find((group) => group.roleId === "mercy")?.items.map((item) => item.content),
    ).toEqual(["A drafted mercy bullet."]);

    const addedText = "Coached the night shift to close the handoff gap.";
    const addedId = bulletDisplayId("mercy", addedText);
    const withAdded = profileWithSeekerBullet(stored, {
      id: addedId,
      text: addedText,
      roleId: "mercy",
    });
    expect(readSeekerBullets(withAdded)).toEqual([
      { id: addedId, text: addedText, roleId: "mercy" },
    ]);
    expect(seekerBulletEvidence(readSeekerBullets(withAdded))[0]?.kind).toBe("SEEKER_REPLY");
    const replaced = replaceUnpickedCandidates({
      employers: ["OpenText", "Mercy General"],
      kept: [{ text: addedText, evidenceIds: [`seeker-bullet:${addedId}`], resultKey: "added" }],
      previous: [
        { text: "Ran a VMware campaign that created $3MM in pipeline.", evidenceIds: ["vm"] },
        { text: addedText, evidenceIds: [`seeker-bullet:${addedId}`] },
      ],
      next: [
        { text: "Built a $4MM pipeline with a partner campaign.", evidenceIds: ["vm"] },
      ],
    });
    expect(replaced.map((item) => item.text)).toEqual([
      addedText,
      "Built a $4MM pipeline with a partner campaign.",
    ]);
    const keptGroups = buildStatementGroups({
      profile,
      bullets: [
        {
          id: addedId,
          roleId: "mercy",
          text: addedText,
          evidenceIds: [`seeker-bullet:${addedId}`],
          seekerOwned: true,
        },
      ],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: [addedId],
      primaryRoleId: "opentext",
      directRoleIds: [],
      asOf,
    });
    const keptMercy = keptGroups.find((group) => group.roleId === "mercy")?.items[0];
    expect(keptMercy?.content).toBe(addedText);
    expect(keptMercy?.checked).toBe(true);
    expect(keptMercy?.seekerOwned).toBe(true);

    const claim = (id: string, text: string) => ({
      id,
      text,
      supports: [{ sourceId: "profile:name", quote: text }],
    });
    const generated = resumeWithExactPickedBullets(
      {
        type: "RESUME",
        header: { name: claim("name", "Ada"), contactDetails: [] },
        summary: [],
        experience: [
          {
            roleId: "opentext",
            employer: "OpenText",
            title: "Account Executive",
            startDate: null,
            endDate: null,
            location: null,
            hidden: false,
            condensed: false,
            bullets: [claim("old", "Old OpenText bullet.")],
          },
          {
            roleId: "legacy",
            employer: "Legacy Systems",
            title: "Sales Representative",
            startDate: "2000-01",
            endDate: "2004-06",
            location: null,
            hidden: true,
            condensed: true,
            bullets: [claim("old-legacy", "Kept an old territory.")],
          },
        ],
        skills: [],
        education: [],
        credentials: [],
      },
      [
        { statementId: addedId, roleId: "mercy", content: addedText },
        { statementId: "legacy-pick", roleId: "legacy", content: "Kept an old territory." },
        { statementId: "ot", roleId: "opentext", content: openTextAchievement },
      ],
      "profile:name",
    );
    const onResume = generated.experience.filter((role) => !role.hidden && !role.condensed);
    const earlier = generated.experience.filter((role) => !role.hidden && role.condensed);
    expect(onResume.map((role) => role.roleId)).toEqual(["opentext"]);
    expect(earlier.map((role) => role.roleId)).toEqual([]);
    expect(generated.experience.find((role) => role.roleId === "legacy")?.bullets).toEqual([]);
    const writer = buildResumeWriterPackage({
      profile,
      bullets: [
        {
          id: addedId,
          roleId: "mercy",
          text: addedText,
          evidenceIds: [],
          seekerOwned: true,
        },
        {
          id: "legacy-pick",
          roleId: "legacy",
          text: "Kept an old territory.",
          evidenceIds: [],
          seekerOwned: true,
        },
      ],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: [addedId, "legacy-pick"],
      primaryRoleId: "opentext",
      directRoleIds: [],
      planCondensedRoleIds: [],
      hiddenRoleIds: ["legacy"],
      asOf,
    });
    expect(writer.requiredStatements.map((item) => item.roleId)).not.toContain("legacy");
    expect(writer.requiredStatements.some((item) => item.content === addedText)).toBe(true);

    const pickerSource = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    const addSource = readFileSync(
      "src/lib/application-assets/resume-statement-picker-data.ts",
      "utf8",
    );
    const actionSource = readFileSync("src/app/actions/application-assets.ts", "utf8");
    expect(pickerSource).toContain("leaveOffResume");
    expect(pickerSource).toContain("addBullet");
    expect(applicationAssetConfig.labels.leaveOffResume).toBe("Leave off resume");
    expect(applicationAssetConfig.labels.addBullet).toBe("Add a bullet");
    expect(addSource).toContain("export async function addSeekerBullet");
    expect(addSource.slice(addSource.indexOf("export async function addSeekerBullet"))).not.toContain(
      "runPaidStructuredCall",
    );
    expect(addSource).not.toContain("generateStructured");
    expect(actionSource).toContain("hiddenRoleIdsForCampaign");
    expect(actionSource).not.toContain('getAll("hiddenRoleId")');
  });

  it("removes a bullet from the list and does not suggest that result again", () => {
    const openText = "Closed a $1.3MM Bank of America deal.";
    const reworded = "Closed the Bank of America deal for $1.3MM.";
    const mercyText = "Precepted 8 new nurses on the night shift.";
    const capstone = "Shipped a clinic intake form during a capstone.";
    const profile: PickerProfile = {
      experience: [
        {
          id: "opentext",
          employer: salesProfile.experience[0]!.employer,
          title: salesProfile.experience[0]!.title,
          endDate: null,
          achievements: [openText],
        },
        {
          id: "mercy",
          employer: nursingProfile.experience[0]!.employer,
          title: nursingProfile.experience[0]!.title,
          endDate: null,
          achievements: [mercyText],
        },
        {
          id: "intern",
          employer: "County Hospital",
          title: "Nursing Intern",
          endDate: null,
          achievements: [capstone],
        },
      ],
      educationTexts: nursingProfile.educationTexts,
      projectTexts: graduateProfile.projectTexts,
    };
    const sourceProfile = {
      achievements: profile.experience.map((role) => role.achievements),
      bulletRoleChoices: { deal: "opentext" },
    };
    const dismissed = profileWithDismissedBullet(sourceProfile, openText, ["OpenText", "Mercy General"]);
    expect(readDismissedBulletTexts(dismissed)).toEqual([openText]);
    expect(dismissed.achievements).toEqual(sourceProfile.achievements);
    expect(dismissed.bulletRoleChoices).toEqual({ deal: "opentext" });

    const offered = profileWithoutDismissedResults(profile, [openText]);
    expect(offered.experience.find((role) => role.id === "opentext")?.achievements).toEqual([]);
    expect(profile.experience.find((role) => role.id === "opentext")?.achievements).toEqual([openText]);
    const groups = buildStatementGroups({
      profile: offered,
      bullets: [],
      settings: DEFAULT_HARPER_DRAFT_SETTINGS,
      savedPickIds: null,
      primaryRoleId: "opentext",
      directRoleIds: [],
      asOf,
    });
    expect(groups.find((group) => group.roleId === "opentext")?.items).toEqual([]);
    expect(groups.find((group) => group.roleId === "mercy")?.items.map((item) => item.content)).toEqual([
      mercyText,
    ]);
    expect(groups.find((group) => group.roleId === "intern")?.items.map((item) => item.content)).toEqual([
      capstone,
    ]);
    expect(graduateProfile.projectTexts).toContain("Capstone project");

    const assigned = assignCandidateBullets({
      bands: [{ roleId: "opentext", employer: "OpenText", candidateCount: 4 }],
      evidence: [
        {
          id: "boa",
          kind: "INTERVIEW_ANSWER",
          text: `${openText} at OpenText.`,
          roleId: null,
          question: "Tell me about a deal at OpenText.",
        },
        {
          id: "forecast",
          kind: "INTERVIEW_ANSWER",
          text: "Held forecast deviation to 5-10% at OpenText.",
          roleId: null,
          question: "How did you run the forecast?",
        },
      ],
      dismissedTexts: [openText],
      bullets: [
        { roleId: "opentext", text: reworded, evidenceIds: ["boa"] },
        { roleId: "opentext", text: "Held forecast deviation to 5-10%.", evidenceIds: ["forecast"] },
      ],
    });
    expect(assigned.map((item) => item.text)).toEqual(["Held forecast deviation to 5-10%."]);

    const seekerId = bulletDisplayId("mercy", mercyText);
    const kept = profileWithSeekerBullet(dismissed, { id: seekerId, text: mercyText, roleId: "mercy" });
    const removed = profileWithoutSeekerBullet(kept, seekerId);
    expect(readSeekerBullets(removed)).toEqual([]);
    expect(readDismissedBulletTexts(removed)).toEqual([openText]);

    const refreshed = replaceUnpickedCandidates({
      employers: ["OpenText", "Mercy General"],
      dismissedTexts: [openText],
      kept: [],
      previous: [{ text: openText, evidenceIds: ["boa"] }],
      next: [
        { text: reworded, evidenceIds: ["boa"] },
        { text: "Held forecast deviation to 5-10%.", evidenceIds: ["forecast"] },
      ],
    });
    expect(refreshed.map((item) => item.text)).toEqual(["Held forecast deviation to 5-10%."]);

    const pickerSource = readFileSync("src/components/ResumeStatementPicker.tsx", "utf8");
    const removeSource = readFileSync("src/lib/application-assets/resume-statement-picker-data.ts", "utf8");
    const removeFn = removeSource.slice(removeSource.indexOf("export async function removePickerBullet"));
    expect(applicationAssetConfig.labels.removeBullet).toBe("Remove");
    expect(pickerSource).toContain("removeBullet");
    expect(removeFn).not.toContain("runPaidStructuredCall");
    expect(removeFn).not.toContain("generateStructured");
    expect(removeFn).not.toContain("consultationStatement");
    expect(removeFn).not.toContain("achievements:");
  });

  it("hides a job on one application only and carries existing hides onto picker state", () => {
    const profileJson = {
      hiddenRoleIds: ["mercy"],
      seekerBullets: [{ id: "keep", text: "Kept.", roleId: "opentext" }],
    };
    const carried = carryProfileHiddenRoles({
      profileJson,
      campaigns: [
        {
          id: "app-a",
          resumeStatementPicksJson: { picks: ["stmt-1"], seen: ["stmt-1", "stmt-2"] },
          workspaceSeenJson: null,
        },
        {
          id: "app-b",
          resumeStatementPicksJson: ["stmt-2"],
          workspaceSeenJson: null,
        },
        {
          id: "app-new",
          resumeStatementPicksJson: null,
          workspaceSeenJson: null,
        },
      ],
    });
    expect(carried?.profileJson).not.toHaveProperty("hiddenRoleIds");
    expect(carried?.profileJson.seekerBullets).toEqual(profileJson.seekerBullets);
    const appA = carried?.updates.find((item) => item.id === "app-a")?.resumeStatementPicksJson;
    const appB = carried?.updates.find((item) => item.id === "app-b")?.resumeStatementPicksJson;
    expect(appA).toEqual({
      picks: ["stmt-1"],
      seen: ["stmt-1", "stmt-2"],
      hiddenRoleIds: ["mercy"],
    });
    expect(appB).toEqual({ picks: ["stmt-2"], hiddenRoleIds: ["mercy"] });
    expect(carried?.updates.find((item) => item.id === "app-new")).toBeUndefined();
    expect(
      carryProfileHiddenRoles({ profileJson: carried?.profileJson, campaigns: [] }),
    ).toBeNull();

    const leftOffA = resumePicksWithRoleLeftOff(appA, "mercy", true);
    const leftOnB = resumePicksWithRoleLeftOff(
      { picks: ["stmt-2"], seen: ["stmt-2"] },
      "mercy",
      false,
    );
    expect(readResumePicksHiddenRoleIds(leftOffA)).toEqual(["mercy"]);
    expect(leftOffA.picks).toEqual(["stmt-1"]);
    expect(leftOffA.seen).toEqual(["stmt-1", "stmt-2"]);
    expect(readResumePicksHiddenRoleIds(leftOnB)).toEqual([]);
    expect(leftOnB.picks).toEqual(["stmt-2"]);
    expect(leftOnB.seen).toEqual(["stmt-2"]);
    expect(readResumePicksHiddenRoleIds(leftOffA)).not.toBe(readResumePicksHiddenRoleIds(leftOnB));

    const claim = (id: string, text: string) => ({
      id,
      text,
      supports: [{ sourceId: "profile:name", quote: text }],
    });
    const shown = (hiddenRoleIds: readonly string[]) => {
      const exact = resumeWithExactPickedBullets(
        {
          type: "RESUME",
          header: { name: claim("name", "Ada"), contactDetails: [] },
          summary: [],
          experience: [
            {
              roleId: "opentext",
              employer: salesProfile.experience[0]!.employer ?? "",
              title: salesProfile.experience[0]!.title ?? "",
              startDate: null,
              endDate: null,
              location: null,
              hidden: hiddenRoleIds.includes("opentext"),
              condensed: false,
              bullets: [claim("ot", "Closed a deal.")],
            },
            {
              roleId: "mercy",
              employer: nursingProfile.experience[0]!.employer ?? "",
              title: nursingProfile.experience[0]!.title ?? "",
              startDate: null,
              endDate: null,
              location: null,
              hidden: hiddenRoleIds.includes("mercy"),
              condensed: false,
              bullets: [claim("mercy", "Precepted new nurses.")],
            },
          ],
          skills: [],
          education: [],
          credentials: [],
        },
        [
          { statementId: "ot", roleId: "opentext", content: "Closed a deal." },
          { statementId: "mercy", roleId: "mercy", content: "Precepted new nurses." },
        ],
        "profile:name",
      );
      return exact.experience.filter((role) => !role.hidden).map((role) => role.roleId);
    };
    expect(shown(readResumePicksHiddenRoleIds(leftOffA))).toEqual(["opentext"]);
    expect(shown(readResumePicksHiddenRoleIds(leftOnB))).toEqual(["opentext", "mercy"]);

    const profile: PickerProfile = {
      experience: [
        {
          id: "opentext",
          employer: salesProfile.experience[0]!.employer,
          title: salesProfile.experience[0]!.title,
          endDate: null,
        },
        {
          id: "mercy",
          employer: nursingProfile.experience[0]!.employer,
          title: nursingProfile.experience[0]!.title,
          endDate: null,
        },
      ],
      educationTexts: nursingProfile.educationTexts,
      projectTexts: graduateProfile.projectTexts,
    };
    const bullets = [
      { id: "ot", roleId: "opentext", text: "Closed a deal.", evidenceIds: [] as string[] },
      { id: "mercy-bullet", roleId: "mercy", text: "Precepted new nurses.", evidenceIds: [] as string[] },
    ];
    const writerFor = (hiddenRoleIds: string[]) =>
      buildResumeWriterPackage({
        profile,
        bullets,
        settings: DEFAULT_HARPER_DRAFT_SETTINGS,
        savedPickIds: ["ot", "mercy-bullet"],
        primaryRoleId: "opentext",
        directRoleIds: [],
        planCondensedRoleIds: [],
        hiddenRoleIds,
        asOf,
      });
    expect(writerFor(["mercy"]).requiredStatements.map((item) => item.roleId)).not.toContain("mercy");
    expect(writerFor([]).requiredStatements.map((item) => item.roleId)).toContain("mercy");
    expect(graduateProfile.projectTexts).toContain("Capstone project");

    const pickerData = readFileSync("src/lib/application-assets/resume-statement-picker-data.ts", "utf8");
    const profileSchema = readFileSync("src/lib/product-research/candidate-profile.ts", "utf8");
    const saveStart = pickerData.indexOf("export async function saveResumeRoleVisibility");
    const save = pickerData.slice(saveStart, pickerData.indexOf("export async function addSeekerBullet"));
    expect(save).toContain("resumeStatementPicksJson");
    expect(save).not.toContain("profileWithHiddenRole");
    expect(save).not.toContain("runPaidStructuredCall");
    expect(save).not.toContain("applicationAsset");
    expect(pickerData).not.toContain("readHiddenRoleIds");
    expect(pickerData).not.toContain("profileWithHiddenRole");
    expect(profileSchema).not.toContain("hiddenRoleIds");
  });
});
