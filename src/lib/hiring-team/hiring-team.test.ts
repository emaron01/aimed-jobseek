import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const isPersonaAiConfigured = vi.hoisted(() => vi.fn(() => false));
const generateStructured = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isPersonaAiConfigured,
    getPersonaAiProvider: () => ({ generateStructured }),
  };
});
import { readFileSync } from "node:fs";
import {
  hiringTeamEvidenceExcerpts,
} from "@/lib/hiring-team/evidence";
import { synthesizeHiringTeamRole } from "@/lib/hiring-team/ai";
import {
  applyHiringManagerInterviewStage,
  assessHiringTeamDraft,
  talkingPointWrittenFromPersonaJob,
  fieldRestatesJobRequirement,
  HIRING_MANAGER_WALKTHROUGH,
  jobRequirementLines,
  mentionsInternalSystemState,
  narrativeFromDraft,
  stripClaimPrefix,
  type HiringTeamDraftFields,
} from "@/lib/hiring-team/draft-quality";
import {
  applyHiringTeamIdentificationGuardrails,
  evidenceTextFor,
  hiringManagerTitles,
  rolesDescribeSamePerson,
  titlesCoherentToRole,
} from "@/lib/hiring-team/identify";
import {
  FINANCIAL_CONTROLLER_IDENTIFICATION_FIXTURE,
  NORMAL_JOB_IDENTIFICATION_FIXTURE,
  NURSE_MANAGER_IDENTIFICATION_FIXTURE,
} from "@/lib/hiring-team/identification-fixtures";
import type { HiringTeamJobEvidence } from "@/lib/hiring-team/evidence";
import { HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION } from "@/lib/hiring-team/contract";
import { applicationPersonaOptions } from "@/lib/hiring-team/scope";
import {
  addApplicationHiringTeamRole,
  addTemplateToApplication,
  approveApplicationHiringTeamRole,
  rebuildApplicationHiringTeamRole,
  removeApplicationHiringTeamRole,
  savePersonaAsTemplate,
  syncApplicationHiringTeam,
  updateApplicationHiringTeamRole,
} from "@/lib/hiring-team/build";
import { mergeExistingHiringTeamRoles } from "@/lib/hiring-team/merge-existing";
import { isUneditedDefaultTemplate } from "@/lib/hiring-team/templates";
import { findNearDuplicatePersonaPairs } from "@/lib/persona/persona-differentiation";
import {
  personaAiDraftSchema,
  PERSONA_SYNTHESIS_PROMPT_VERSION,
} from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import {
  FINANCIAL_CONTROLLER_MODEL,
  FINANCIAL_CONTROLLER_POSTING,
  NORMAL_JOB_MODEL,
  NORMAL_JOB_POSTING,
  NURSE_MANAGER_MODEL,
  NURSE_MANAGER_POSTING,
} from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { hiringTeamConfig, vocab } from "@/lib/product-config";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import { hasTestDatabase } from "@/test/database";

function substantiveDirectorDraft(): HiringTeamDraftFields {
  return {
    overview:
      "The Director of Engineering owns delivery of the warehouse robot fleet, on-call load, team capacity, and the hiring bar for engineers who ship motion software.",
    pressures: [
      "They are measured on fleet uptime and how quickly the motion service recovers after an incident, so an open senior seat leaves that load on them.",
    ],
    impact:
      "This hire takes the motion-service on-call rotation off the director and lets them keep the fleet reliability plan on schedule.",
    needs: [
      "In the first months, own production incidents on the motion service through resolution.",
      "Set a hiring bar the director can defend when the next engineer is interviewed.",
    ],
    concerns: [
      "They will doubt a candidate who has not owned a production robotics service through an incident.",
    ],
    interviewStage: "hiring manager chronological walk-through",
    evaluates: ["Whether the candidate has owned production outcomes, not only designed them."],
    talkingPoints: [
      "Describe how you would sit with the reliability rotation in the first month and take the overnight pages.",
    ],
    communication: [
      "They want the work in the order it happened, with the outcome you owned.",
    ],
  };
}

function jobFromParsed(
  model: Parameters<typeof normalizeParsedJobRequirement>[0],
  posting: string,
): HiringTeamJobEvidence {
  const parsed = normalizeParsedJobRequirement(model, posting);
  return {
    title: parsed.title,
    companyName: parsed.companyName,
    location: parsed.location,
    workArrangement: parsed.workArrangement,
    employmentType: parsed.employmentType,
    seniority: parsed.seniority,
    reportingLine: parsed.reportingLine,
    responsibilities: parsed.responsibilities,
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
  };
}

function fixtureJob(overrides: Partial<HiringTeamJobEvidence> = {}): HiringTeamJobEvidence {
  const parsed = normalizeParsedJobRequirement(NORMAL_JOB_MODEL, NORMAL_JOB_POSTING);
  return {
    title: parsed.title,
    companyName: parsed.companyName,
    location: parsed.location,
    workArrangement: parsed.workArrangement,
    employmentType: parsed.employmentType,
    seniority: parsed.seniority,
    reportingLine: parsed.reportingLine,
    responsibilities: parsed.responsibilities,
    requiredItems: parsed.requiredItems,
    preferredItems: parsed.preferredItems,
    scorecard: parsed.scorecard,
    ...overrides,
  };
}

describe("hiring team evidence and selectors", () => {
  afterEach(() => {
    isPersonaAiConfigured.mockReturnValue(false);
    generateStructured.mockReset();
  });

  it("uses the reporting line as the Hiring Manager title", () => {
    expect(
      hiringManagerTitles({
        likelyTitles: ["Hiring Manager"],
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
      }),
    ).toEqual(["Director of Engineering", "Hiring Manager"]);
  });

  it("enforces reporting line, grounding, semantic dedupe, and stable keys on model output", () => {
    const job = fixtureJob();
    const evidenceText = evidenceTextFor({
      job,
      research: null,
      includeResearch: false,
    });
    const first = applyHiringTeamIdentificationGuardrails({
      roles: NORMAL_JOB_IDENTIFICATION_FIXTURE,
      job,
      evidenceText,
    });
    const manager = first.roles.find((role) => role.roleKey === "hiring_manager");
    expect(manager?.likelyTitles[0]).toBe("Director of Engineering");
    expect(first.corrections.some((item) => item.roleKey === "hiring_manager")).toBe(true);
    expect(first.roles.filter((role) => role.roleKey === "hiring_manager")).toHaveLength(1);
    expect(first.dropped.some((item) => /marketing|cmo/i.test(item.name))).toBe(true);
    expect(first.roles.filter((role) => /reliability/i.test(role.name))).toHaveLength(1);
    expect(first.roles.length).toBeLessThanOrEqual(hiringTeamConfig.maxIdentifiedRoles);
    const identifySource = readFileSync("src/lib/hiring-team/identify.ts", "utf8");
    expect(identifySource).not.toContain("INDIRECT_SIGNALS");
    expect(identifySource).not.toContain("panelRoles");
    expect(identifySource).not.toMatch(/robot\w*\s*\||reliab\\w|ros2|incident response/);

    const second = applyHiringTeamIdentificationGuardrails({
      roles: [
        {
          name: "Reliability or Incident Response Lead",
          likelyTitles: ["Reliability Engineering Lead"],
          department: "Engineering",
          involvement: "INDIRECT",
          whyInvolved: "The mission is to make warehouse robots reliable, so a reliability lead is affected by the hire.",
          evidence: [
            { claim: "The mission of this role is to make warehouse robots reliable.", kind: "FACT" },
          ],
        },
      ],
      job,
      evidenceText,
      existing: first.roles.map((role) => ({
        suggestionKey: role.roleKey,
        name: role.name,
        titles: role.likelyTitles,
      })),
    });
    const reliability = first.roles.find((role) => /reliability/i.test(role.name));
    expect(second.roles.find((role) => /reliability/i.test(role.name))?.roleKey).toBe(
      reliability?.roleKey,
    );

    const nurseJob = jobFromParsed(NURSE_MANAGER_MODEL, NURSE_MANAGER_POSTING);
    const nurse = applyHiringTeamIdentificationGuardrails({
      roles: NURSE_MANAGER_IDENTIFICATION_FIXTURE,
      job: nurseJob,
      evidenceText: evidenceTextFor({ job: nurseJob, research: null, includeResearch: false }),
    });
    expect(nurse.roles.find((role) => role.roleKey === "hiring_manager")?.likelyTitles[0]).toBe(
      "Director of Nursing",
    );
    expect(nurse.roles.some((role) => /charge nurse/i.test(role.name))).toBe(true);
    expect(nurse.roles.some((role) => /robot/i.test(role.name))).toBe(false);

    const financeJob = jobFromParsed(FINANCIAL_CONTROLLER_MODEL, FINANCIAL_CONTROLLER_POSTING);
    const finance = applyHiringTeamIdentificationGuardrails({
      roles: FINANCIAL_CONTROLLER_IDENTIFICATION_FIXTURE,
      job: financeJob,
      evidenceText: evidenceTextFor({
        job: financeJob,
        research: null,
        includeResearch: false,
      }),
    });
    expect(finance.roles.find((role) => role.roleKey === "hiring_manager")?.likelyTitles[0]).toBe(
      "Chief Financial Officer",
    );
    expect(finance.roles.some((role) => /accounting/i.test(role.name))).toBe(true);
    expect(finance.roles.some((role) => /robot/i.test(role.name))).toBe(false);

    const empty = applyHiringTeamIdentificationGuardrails({
      roles: [],
      job: financeJob,
      evidenceText: evidenceTextFor({
        job: financeJob,
        research: null,
        includeResearch: false,
      }),
    });
    expect(empty.roles).toHaveLength(1);
    expect(empty.roles[0]?.likelyTitles[0]).toBe("Chief Financial Officer");
  });

  it("rejects persona fields that only restate the job requirement", () => {
    const lines = jobRequirementLines(fixtureJob());
    expect(
      fieldRestatesJobRequirement("They need the hire to deliver: 5 years of Python", lines),
    ).toBe(true);
    expect(
      fieldRestatesJobRequirement(
        "Hiring Manager will press on Reports to: Director of Engineering",
        lines,
      ),
    ).toBe(true);
    const accepted = assessHiringTeamDraft({
      involvement: "DIRECT",
      jobLines: lines,
      fields: substantiveDirectorDraft(),
    });
    expect(accepted.ok).toBe(true);
    const restated = assessHiringTeamDraft({
      involvement: "DIRECT",
      jobLines: lines,
      fields: {
        ...substantiveDirectorDraft(),
        needs: [
          "They need the hire to deliver: 5 years of Python",
          "They need the hire to deliver: Leads incident response",
        ],
      },
    });
    expect(restated.ok).toBe(false);
    const identifySource = readFileSync("src/lib/hiring-team/identify.ts", "utf8");
    const buildSource = readFileSync("src/lib/hiring-team/build.ts", "utf8");
    expect(identifySource).not.toContain("feels this hire");
    expect(identifySource).not.toContain("connect a story");
    expect(identifySource).not.toContain("draftHiringTeamRole");
    expect(buildSource).not.toContain("applyModelDraft");
    expect(buildSource).not.toContain("evidence draft");
    expect(stripClaimPrefix("INFERENCE: Owns delivery of the warehouse robot fleet.")).toBe(
      "Owns delivery of the warehouse robot fleet.",
    );
    expect(mentionsInternalSystemState("incomplete company research and ambiguous identity")).toBe(
      true,
    );
    expect(mentionsInternalSystemState("They own fleet reliability and the hiring bar.")).toBe(
      false,
    );
    expect(
      applyHiringManagerInterviewStage("panel competency interview", "Reports to: Director of Engineering"),
    ).toBe(HIRING_MANAGER_WALKTHROUGH);
    const systemStateDraft = assessHiringTeamDraft({
      involvement: "DIRECT",
      jobLines: lines,
      fields: {
        ...substantiveDirectorDraft(),
        pressures: [
          "The recruiter must keep the search moving despite incomplete company research.",
        ],
      },
    });
    expect(systemStateDraft.ok).toBe(false);
  });

  it("stores a model draft only after it stops restating the job, and keeps identification when synthesis cannot run", async () => {
    const job = fixtureJob();
    const lines = jobRequirementLines(job);
    const good = substantiveDirectorDraft();
    const narrative = narrativeFromDraft({
      involvement: "DIRECT",
      evidenceText: "Reports to: Director of Engineering",
      fields: good,
      draft: personaAiDraftSchema.parse({
        name: "Hiring Manager",
        roleSummary: good.overview,
        evidenceRefs: [
          {
            claim: "owns delivery of the warehouse robot fleet",
            kind: "FACT",
          },
        ],
      }),
    });
    expect(narrative.overview.kind).toBe("INFERENCE");

    isPersonaAiConfigured.mockReturnValue(false);
    const unavailable = await synthesizeHiringTeamRole({
      roleName: "Hiring Manager",
      likelyTitles: ["Director of Engineering"],
      department: "Engineering",
      whyThisRoleMatters: "The posting says this job reports to Director of Engineering.",
      involvement: "DIRECT",
      notes: null,
      excerpts: [],
      peers: [],
      jobLines: lines,
      evidenceText: "Reports to: Director of Engineering",
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.status).toBe("PARTIAL");
    expect(generateStructured).not.toHaveBeenCalled();

    isPersonaAiConfigured.mockReturnValue(true);
    generateStructured
      .mockResolvedValueOnce({
        data: {
          personaDraft: personaAiDraftSchema.parse({
            name: "Hiring Manager",
            roleSummary: "Feels the hire through the reporting line.",
            impact: "Presses on the reporting line.",
            needsFromHire: [
              "They need the hire to deliver: 5 years of Python",
              "They need the hire to deliver: Leads incident response",
            ],
            candidateConcerns: ["Hiring Manager will press on Reports to: Director of Engineering"],
            talkingPoints: ["Connect a story to the reporting line."],
            communicationApproach: ["Connect a story to Reports to: Director of Engineering"],
            interviewStage: "hiring manager chronological walk-through",
            organizationalPressures: ["Presses on Reports to: Director of Engineering"],
          }),
        },
      })
      .mockResolvedValueOnce({
        data: {
          personaDraft: personaAiDraftSchema.parse({
            name: "Hiring Manager",
            roleSummary: good.overview,
            organizationalPressures: good.pressures,
            impact: good.impact,
            needsFromHire: good.needs,
            candidateConcerns: good.concerns,
            talkingPoints: good.talkingPoints,
            communicationApproach: good.communication,
            interviewStage: good.interviewStage,
            evaluates: good.evaluates,
            evidenceRefs: [
              {
                claim: "owns delivery of the warehouse robot fleet",
                kind: "INFERENCE",
              },
            ],
          }),
        },
      });
    const drafted = await synthesizeHiringTeamRole({
      roleName: "Hiring Manager",
      likelyTitles: ["Director of Engineering"],
      department: "Engineering",
      whyThisRoleMatters: "The posting says this job reports to Director of Engineering.",
      involvement: "DIRECT",
      notes: null,
      excerpts: [],
      peers: [],
      jobLines: lines,
      evidenceText: "Reports to: Director of Engineering",
    });
    expect(generateStructured).toHaveBeenCalledTimes(1);
    expect(drafted.ok).toBe(true);
    if (drafted.ok) {
      expect(drafted.narrative.overview.text).toContain("reporting line");
    }
  });

  it("keeps the last parseable hiring-team draft when quality still fails", async () => {
    const lines = jobRequirementLines(fixtureJob());
    const restated = {
      data: {
        personaDraft: personaAiDraftSchema.parse({
          name: "Hiring Manager",
          roleSummary: "Feels the hire through the reporting line.",
          impact: "Presses on the reporting line.",
          needsFromHire: [
            "They need the hire to deliver: 5 years of Python",
            "They need the hire to deliver: Leads incident response",
          ],
          candidateConcerns: ["Hiring Manager will press on Reports to: Director of Engineering"],
          talkingPoints: ["Connect a story to the reporting line."],
          communicationApproach: ["Connect a story to Reports to: Director of Engineering"],
          interviewStage: "hiring manager chronological walk-through",
          organizationalPressures: ["Presses on Reports to: Director of Engineering"],
        }),
      },
    };
    isPersonaAiConfigured.mockReturnValue(true);
    generateStructured.mockResolvedValueOnce(restated).mockResolvedValueOnce(restated);
    const drafted = await synthesizeHiringTeamRole({
      roleName: "Hiring Manager",
      likelyTitles: ["Director of Engineering"],
      department: "Engineering",
      whyThisRoleMatters: "The posting says this job reports to Director of Engineering.",
      involvement: "DIRECT",
      notes: null,
      excerpts: [],
      peers: [],
      jobLines: lines,
      evidenceText: "Reports to: Director of Engineering",
    });
    expect(drafted.ok).toBe(true);
    if (drafted.ok) {
      expect(drafted.narrative.overview.text).toContain("reporting line");
    }
  });

  it("keeps seeker templates and removes only unedited defaults", () => {
    const created = new Date("2026-09-01T00:00:00.000Z");
    const edited = new Date("2026-09-02T00:00:00.000Z");
    expect(
      isUneditedDefaultTemplate({
        templateKey: "recruiter",
        createdAt: created,
        updatedAt: created,
      }),
    ).toBe(true);
    expect(
      isUneditedDefaultTemplate({
        templateKey: "hiring_manager",
        createdAt: created,
        updatedAt: edited,
      }),
    ).toBe(false);
    expect(
      isUneditedDefaultTemplate({
        templateKey: null,
        createdAt: created,
        updatedAt: created,
      }),
    ).toBe(false);
    const sql = readFileSync(
      "prisma/migrations/20260923193000_retire_default_hiring_team_templates/migration.sql",
      "utf8",
    );
    expect(sql).toContain("'recruiter'");
    expect(sql).toContain("updatedAt");
    expect(sql).not.toContain("DELETE FROM \"Persona\"");
  });

  it("keeps company research out of evidence when the employer is undisclosed", () => {
    const excerpts = hiringTeamEvidenceExcerpts({
      job: {
        title: NORMAL_JOB_MODEL.title,
        companyName: null,
        location: NORMAL_JOB_MODEL.location,
        workArrangement: NORMAL_JOB_MODEL.workArrangement,
        employmentType: NORMAL_JOB_MODEL.employmentType,
        seniority: NORMAL_JOB_MODEL.seniority,
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
        responsibilities: NORMAL_JOB_MODEL.responsibilities,
        requiredItems: NORMAL_JOB_MODEL.requiredItems,
        preferredItems: NORMAL_JOB_MODEL.preferredItems,
        scorecard: {
          mission: { id: "m", text: NORMAL_JOB_MODEL.scorecard.mission.text, inferred: false },
          outcomes: NORMAL_JOB_MODEL.scorecard.outcomes.map((item) => ({
            id: item.text,
            text: item.text,
            inferred: item.inferred,
          })),
          competencies: [],
        },
      },
      research: {
        companySummary: "Secret robotics lab",
        whatTheySell: "Warehouse robots",
        businessModel: "Hardware",
        hiringSignals: ["Opening a second site"],
        riskSignals: [],
      },
      includeResearch: false,
    });
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0]?.sourceId).toBe("job-requirement");
    expect(excerpts[0]?.text).toContain("Director of Engineering");
    expect(excerpts[0]?.text).not.toContain("Secret robotics lab");
    expect(excerpts[0]?.text).not.toContain("Opening a second site");
  });

  it("shows only the current application's roles in selectors", () => {
    expect(
      applicationPersonaOptions({
        applicationPersonas: [{ id: "app-role", name: "Recruiter" }],
        inPlay: [
          { personaId: "other-app", name: "Hiring Manager" },
          { personaId: "app-role", name: "Recruiter" },
        ],
      }).map((persona) => persona.id),
    ).toEqual(["app-role"]);
  });

  it("keeps near-duplicate roles distinct in the differentiation check", () => {
    const pairs = findNearDuplicatePersonaPairs([
      {
        id: "a",
        name: "Hiring Manager",
        painPoints: ["Needs a motion-planning owner who can ship the service"],
        messagingNotes: ["Walk the work chronologically and ask who owned the outcome"],
      },
      {
        id: "b",
        name: "Recruiter",
        painPoints: ["Needs a motion-planning owner who can ship the service"],
        messagingNotes: ["Walk the work chronologically and ask who owned the outcome"],
      },
    ]);
    expect(pairs).toHaveLength(1);
  });

  it("synthesizes Hiring Team roles as inference and bumps the prompt version", () => {
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("13");
    expect(HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION).toBe("2");
    const prompt = readFileSync("src/lib/prompt-content/persona-synthesis.ts", "utf8");
    expect(prompt).toContain("FACT");
    expect(prompt).toContain("INFERENCE");
    const messages = buildPersonaSynthesisMessages({
      productName: "Hiring Manager",
      productSnapshot: {},
      productMessaging: null,
      buyerRole: {
        suggestionKey: "hiring_manager",
        name: "Hiring Manager",
        likelyTitles: ["Director of Engineering"],
        departmentFunction: null,
        whyThisRoleMatters: "Owns the role",
        confidence: "MEDIUM",
        evidenceRefs: [],
      },
      userContext: null,
      productEvidence: [],
      personaEvidence: [],
      icpContext: null,
      existingApprovedPersonas: [
        { id: "recruiter", name: "Recruiter", painPoints: [], messagingNotes: [] },
      ],
    });
    expect(messages[0]?.content).toContain("INFERENCE");
    expect(messages[0]?.content).toContain("Talking points");
    expect(messages[0]?.content).toContain("Impact");
    expect(messages[0]?.content).toContain("organizationalPressures");
    expect(messages[0]?.content).toContain("Do not restate");
    expect(messages[0]?.content).toContain("Do not prefix");
    expect(messages[0]?.content).toContain("internal system state");
    expect(messages[0]?.content).not.toContain("GTM");
    expect(messages[1]?.content).toContain("Recruiter");
  });

  it("labels the Personal Profile and leaves Hiring Team off the main navigation", () => {
    expect(vocab.product.nav).toBe("Personal Profile");
    expect(vocab.product.singular).toBe("Personal Profile");
    const items = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
    });
    expect(items.some((item) => item.href === "/personas")).toBe(false);
    expect(items.some((item) => item.label === "Personal Profile")).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase())("hiring team per application", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let productId = "";
  let icpId = "";

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const org = await prisma.organization.create({
      data: { name: `[TEST] Hiring Team ${suffix}`, slug: `hiring-team-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `hiring-team-${suffix}@example.test`,
        emailNormalized: `hiring-team-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Profile ${suffix}` },
    });
    productId = product.id;
    const icp = await prisma.icp.create({
      data: { organizationId, productId, name: `Employer ${suffix}` },
    });
    icpId = icp.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function application(name: string) {
    return prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name,
        productId,
        icpId,
      },
    });
  }

  async function requirement(
    campaignId: string,
    input: { disposition: "IDENTIFIED" | "UNDISCLOSED"; companyId?: string | null },
  ) {
    return prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: "Senior Product Engineer",
        title: NORMAL_JOB_MODEL.title,
        companyName: input.disposition === "UNDISCLOSED" ? null : NORMAL_JOB_MODEL.companyName,
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
        responsibilities: NORMAL_JOB_MODEL.responsibilities,
        requiredItems: NORMAL_JOB_MODEL.requiredItems,
        preferredItems: NORMAL_JOB_MODEL.preferredItems,
        scorecardJson: NORMAL_JOB_MODEL.scorecard,
        employerDisposition: input.disposition,
        companyId: input.companyId ?? null,
      },
    });
  }

  it("identifies roles from the job, updates them in place after research, and does not copy templates", async () => {
    const template = await prisma.personaTemplate.create({
      data: {
        organizationId,
        name: `Saved interviewer ${suffix}`,
        likelyTitles: ["Staff Engineer"],
        whyThisRoleMatters: "A role the seeker saved.",
      },
    });
    const appA = await application(`App A ${suffix}`);
    const appB = await application(`App B ${suffix}`);
    await requirement(appA.id, { disposition: "UNDISCLOSED" });
    await requirement(appB.id, { disposition: "UNDISCLOSED" });
    await syncApplicationHiringTeam({ organizationId, campaignId: appA.id });
    await syncApplicationHiringTeam({ organizationId, campaignId: appB.id });
    const rolesA = await prisma.persona.findMany({ where: { campaignId: appA.id } });
    const rolesB = await prisma.persona.findMany({ where: { campaignId: appB.id } });
    expect(rolesA.length).toBeGreaterThan(0);
    expect(rolesA.some((role) => role.personaTemplateId === template.id)).toBe(false);
    expect(rolesB.map((role) => role.id).some((id) => rolesA.some((role) => role.id === id))).toBe(
      false,
    );
    const manager = rolesA.find((role) => role.suggestionKey === "hiring_manager");
    expect(manager?.targetTitles).toEqual(
      expect.arrayContaining(["Director of Engineering"]),
    );
    const stored = manager?.profileJson as {
      includeResearch?: boolean;
      narrative?: { impact?: { text?: string }; talkingPoints?: unknown[] };
      evidence?: Array<{ text: string }>;
    };
    expect(stored.includeResearch).toBe(false);
    expect(stored.narrative ?? null).toBeNull();
    expect(manager?.definition ?? null).toBeNull();
    expect(manager?.setupStatus).toBe("NOT_STARTED");
    expect(stored.evidence?.[0]?.text).not.toContain("second site");
    const beforeIds = rolesA.map((role) => role.id).sort();

    const company = await prisma.company.create({
      data: {
        organizationId,
        name: "Acme Robotics",
        normalizedName: `acme-robotics-${suffix}`,
      },
    });
    await prisma.companyResearch.create({
      data: {
        organizationId,
        companyId: company.id,
        status: "COMPLETED",
        companySummary: "Builds warehouse robots",
        hiringSignals: ["Opening a second site"],
        identityAmbiguous: false,
      },
    });
    await prisma.jobRequirement.update({
      where: { campaignId: appA.id },
      data: { employerDisposition: "IDENTIFIED", companyId: company.id },
    });
    await syncApplicationHiringTeam({ organizationId, campaignId: appA.id });
    const refreshedRoles = await prisma.persona.findMany({ where: { campaignId: appA.id } });
    expect(refreshedRoles.map((role) => role.id).sort()).toEqual(beforeIds);
    const refreshed = refreshedRoles.find((role) => role.id === manager!.id);
    const refreshedJson = refreshed?.profileJson as {
      includeResearch?: boolean;
      evidence?: Array<{ text: string }>;
    };
    expect(refreshedJson.includeResearch).toBe(true);
    expect(refreshedJson.evidence?.some((item) => item.text.includes("Opening a second site"))).toBe(
      true,
    );
    expect(await prisma.persona.count({ where: { campaignId: appA.id, suggestionKey: "hiring_manager" } })).toBe(1);

    await updateApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: manager!.id,
      name: "Edited hiring manager",
      likelyTitles: ["Director of Engineering"],
      department: "Engineering",
      whyThisRoleMatters: "Seeker edited this role.",
      notes: "Keep this edit.",
    });
    await syncApplicationHiringTeam({ organizationId, campaignId: appA.id });
    const edited = await prisma.persona.findFirst({ where: { id: manager!.id } });
    expect(edited?.name).toBe("Edited hiring manager");

    await approveApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: manager!.id,
    });
    expect(
      (await prisma.persona.findFirst({ where: { id: manager!.id } }))?.approvalStatus,
    ).toBe("APPROVED");

    expect(rolesA).toHaveLength(1);
    const addedForRebuild = await addApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      name: "Staff Engineer interviewer",
      likelyTitles: ["Staff Engineer"],
      department: "Engineering",
      whyThisRoleMatters: "Judges technical depth on this service.",
      notes: "Panel.",
    });
    await rebuildApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: addedForRebuild.personaId,
    });
    const rebuilt = await prisma.persona.findFirst({ where: { id: addedForRebuild.personaId } });
    expect(rebuilt?.setupStatus).toBe("PARTIAL");
    expect(rebuilt?.definition ?? null).toBeNull();
    const rebuiltJson = rebuilt?.profileJson as { narrative?: unknown; modelNote?: string };
    expect(rebuiltJson.narrative ?? null).toBeNull();
    expect(rebuiltJson.modelNote).toContain("identification only");

    await removeApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: addedForRebuild.personaId,
    });
    expect(
      await prisma.persona.findFirst({
        where: { id: addedForRebuild.personaId, archivedAt: null },
      }),
    ).toBeNull();

    const added = await addTemplateToApplication({
      organizationId,
      campaignId: appB.id,
      templateId: template.id,
    });
    const fromTemplate = await prisma.persona.findFirst({ where: { id: added.personaId } });
    expect(fromTemplate?.personaTemplateId).toBe(template.id);
    expect(fromTemplate?.campaignId).toBe(appB.id);
    const countBefore = await prisma.persona.count({ where: { campaignId: appB.id } });
    await syncApplicationHiringTeam({ organizationId, campaignId: appB.id });
    expect(await prisma.persona.count({ where: { campaignId: appB.id } })).toBe(countBefore);

    const custom = await addApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      name: "Staff Engineer interviewer",
      likelyTitles: ["Staff Engineer"],
      department: "Engineering",
      whyThisRoleMatters: "Judges technical depth on this service.",
      notes: "Panel.",
    });
    const saved = await savePersonaAsTemplate({
      organizationId,
      personaId: custom.personaId,
    });
    const savedTemplate = await prisma.personaTemplate.findFirst({
      where: { id: saved.templateId, organizationId },
    });
    expect(savedTemplate?.templateKey).toBeNull();
    expect(savedTemplate?.name).toBe("Staff Engineer interviewer");
  });

  it("merges existing duplicate roles and keeps personas, edits, contacts, and outreach", async () => {
    const campaign = await application(`Existing dupes ${suffix}`);
    await requirement(campaign.id, { disposition: "UNDISCLOSED" });
    const built = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId: campaign.id,
        name: "Customer Success Leader",
        suggestionKey: "customer_success_leader",
        targetTitles: ["VP Customer Success"],
        whyThisPersonaMatters: "Owns expansion after the sale.",
        setupStatus: "APPROVED",
        approvalStatus: "APPROVED",
        profileJson: { narrative: { overview: "Built customer-success persona." } },
        manuallyEditedFields: ["name"],
      },
    });
    const duplicate = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId: campaign.id,
        name: "Customer Success Leader",
        suggestionKey: "customer_success_leader_2",
        targetTitles: ["Head of Customer Success"],
        whyThisPersonaMatters: "Partners on post-sale expansion.",
      },
    });
    const sponsor = await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId: campaign.id,
        name: "Executive Sponsor",
        suggestionKey: "executive_sponsor",
        targetTitles: ["CRO"],
        whyThisPersonaMatters: "Sponsors the hire at the executive level.",
      },
    });
    await prisma.persona.create({
      data: {
        organizationId,
        productId,
        campaignId: campaign.id,
        name: "Executive Sales Sponsor",
        suggestionKey: "executive_sales_sponsor",
        targetTitles: ["CRO", "Revenue Operations Manager"],
        whyThisPersonaMatters: "Executive sponsor for the sales hire.",
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId,
        ownerUserId: userId,
        firstName: "Pat",
        lastName: "Lee",
        company: "Acme",
      },
    });
    await prisma.campaignContact.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        contactId: contact.id,
        chosenPersonaId: duplicate.id,
      },
    });
    await prisma.applicationAsset.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        type: "EMAIL",
        personaId: duplicate.id,
        groupKey: "EMAIL",
        version: 1,
        contentJson: { type: "EMAIL", subject: "Hello", greeting: "Hi", paragraphs: [], signoff: "Thanks", signerName: "Alex" },
        claimTraceJson: [],
        promptVersion: "1",
        status: "DRAFT",
      },
    });
    await prisma.campaignPersona.create({
      data: {
        organizationId,
        campaignId: campaign.id,
        personaId: duplicate.id,
      },
    });
    const result = await mergeExistingHiringTeamRoles({
      organizationId,
      campaignId: campaign.id,
    });
    expect(result.merged).toBeGreaterThan(0);
    const remaining = await prisma.persona.findMany({
      where: { campaignId: campaign.id, archivedAt: null },
    });
    expect(remaining.filter((row) => /customer success/i.test(row.name))).toHaveLength(1);
    expect(remaining.filter((row) => /executive/i.test(row.name))).toHaveLength(1);
    const survivor = remaining.find((row) => /customer success/i.test(row.name));
    expect(survivor?.id).toBe(built.id);
    expect(survivor?.setupStatus).toBe("APPROVED");
    expect(survivor?.manuallyEditedFields).toEqual(["name"]);
    expect(
      await prisma.campaignContact.count({
        where: { campaignId: campaign.id, chosenPersonaId: built.id },
      }),
    ).toBe(1);
    expect(
      await prisma.applicationAsset.count({
        where: { campaignId: campaign.id, personaId: built.id },
      }),
    ).toBe(1);
    expect(
      await prisma.campaignPersona.count({
        where: { campaignId: campaign.id, personaId: built.id },
      }),
    ).toBe(1);
    expect(
      await prisma.persona.findFirst({
        where: { id: duplicate.id, archivedAt: { not: null } },
      }),
    ).not.toBeNull();
    expect(
      remaining.some((row) => row.id === sponsor.id) ||
        remaining.some((row) => /executive/i.test(row.name)),
    ).toBe(true);
  });

  it("rejects recruiter-job talking points and regenerates from the seeker's perspective", () => {
    expect(
      talkingPointWrittenFromPersonaJob(
        "Describe how you would build a target map for senior sales leaders.",
        "Talent Acquisition Partner",
        ["Recruiter"],
      ),
    ).toBe(true);
    expect(
      talkingPointWrittenFromPersonaJob(
        "Walk them through why this company, this role, and your timeline in the first minute.",
        "Talent Acquisition Partner",
        ["Recruiter"],
      ),
    ).toBe(false);
    const rejected = assessHiringTeamDraft({
      involvement: "DIRECT",
      jobLines: jobRequirementLines(fixtureJob()),
      roleName: "Talent Acquisition Partner",
      likelyTitles: ["Recruiter"],
      fields: {
        ...substantiveDirectorDraft(),
        talkingPoints: [
          "Describe how you would build a target map for senior sales leaders.",
        ],
      },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reasons.join(" ")).toMatch(/seeker should say/i);
    }
  });

  it("merges duplicate Hiring Team roles by meaning and keeps titles coherent", () => {
    expect(
      rolesDescribeSamePerson(
        {
          roleKey: "customer_success_leader",
          name: "Customer Success Leader",
          likelyTitles: ["VP Customer Success"],
          whyInvolved: "Owns expansion after the sale.",
        },
        {
          roleKey: "customer_success_leader_2",
          name: "Customer Success Leader",
          likelyTitles: ["Head of Customer Success"],
          whyInvolved: "Partners on post-sale expansion.",
        },
      ),
    ).toBe(true);
    expect(
      rolesDescribeSamePerson(
        {
          roleKey: "executive_sponsor",
          name: "Executive Sponsor",
          likelyTitles: ["CRO"],
          whyInvolved: "Sponsors the hire at the executive level.",
        },
        {
          roleKey: "executive_sales_sponsor",
          name: "Executive Sales Sponsor",
          likelyTitles: ["CRO", "Revenue Operations Manager"],
          whyInvolved: "Executive sponsor for the sales hire.",
        },
      ),
    ).toBe(true);
    expect(
      titlesCoherentToRole("Executive Sales Sponsor", [
        "CRO",
        "Revenue Operations Manager",
      ]),
    ).toEqual(["CRO"]);
    const merged = applyHiringTeamIdentificationGuardrails({
      roles: [
        {
          name: "Customer Success Leader",
          likelyTitles: ["VP Customer Success"],
          department: "Customer Success",
          involvement: "INDIRECT",
          whyInvolved: "The hire will partner with customer success on expansion after the sale.",
          evidence: [
            { claim: "partner with customer success on expansion after the sale", kind: "FACT" },
          ],
        },
        {
          name: "Customer Success Leader",
          likelyTitles: ["Head of Customer Success"],
          department: "Customer Success",
          involvement: "INDIRECT",
          whyInvolved: "Customer success will feel this hire through expansion after the sale.",
          evidence: [
            { claim: "customer success will feel this hire through expansion after the sale", kind: "FACT" },
          ],
        },
        {
          name: "Executive Sponsor",
          likelyTitles: ["CRO"],
          department: "Sales",
          involvement: "DIRECT",
          whyInvolved: "An executive sponsor will press on the revenue plan for this hire.",
          evidence: [
            { claim: "executive sponsor will press on the revenue plan for this hire", kind: "FACT" },
          ],
        },
        {
          name: "Executive Sales Sponsor",
          likelyTitles: ["CRO", "Revenue Operations Manager"],
          department: "Revenue Operations",
          involvement: "DIRECT",
          whyInvolved: "The executive sales sponsor owns the revenue plan for this hire.",
          evidence: [
            { claim: "executive sales sponsor owns the revenue plan for this hire", kind: "FACT" },
          ],
        },
      ],
      job: fixtureJob(),
      evidenceText:
        "The hire will partner with customer success on expansion after the sale. An executive sponsor will press on the revenue plan for this hire. The executive sales sponsor owns the revenue plan for this hire. Customer success will feel this hire through expansion after the sale.",
    });
    const names = merged.roles.map((role) => role.name);
    expect(names.filter((name) => /customer success/i.test(name))).toHaveLength(1);
    expect(names.filter((name) => /executive/i.test(name))).toHaveLength(1);
    const sponsor = merged.roles.find((role) => /executive/i.test(role.name));
    expect(sponsor?.likelyTitles.some((title) => /revenue operations/i.test(title))).toBe(
      false,
    );
  });
});
