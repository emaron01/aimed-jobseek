import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  hiringTeamEvidenceExcerpts,
} from "@/lib/hiring-team/evidence";
import {
  differentiateNarratives,
  draftHiringTeamRole,
  hiringManagerTitles,
  identifyHiringTeamRoles,
  narrativeLists,
} from "@/lib/hiring-team/identify";
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
import { isUneditedDefaultTemplate } from "@/lib/hiring-team/templates";
import { findNearDuplicatePersonaPairs } from "@/lib/persona/persona-differentiation";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { NORMAL_JOB_MODEL, NORMAL_JOB_POSTING } from "@/lib/job-requirement/fixtures";
import { normalizeParsedJobRequirement } from "@/lib/job-requirement/normalize";
import { vocab } from "@/lib/product-config";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import { hasTestDatabase } from "@/test/database";

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
  it("uses the reporting line as the Hiring Manager title", () => {
    expect(
      hiringManagerTitles({
        likelyTitles: ["Hiring Manager"],
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
      }),
    ).toEqual(["Director of Engineering", "Hiring Manager"]);
  });

  it("identifies direct and indirect roles from the fixture posting, not a fixed list", () => {
    const roles = identifyHiringTeamRoles({
      job: fixtureJob(),
      research: null,
      includeResearch: false,
    });
    expect(roles.some((role) => role.involvement === "DIRECT")).toBe(true);
    expect(roles.some((role) => role.involvement === "INDIRECT")).toBe(true);
    const names = roles.map((role) => role.name).sort();
    expect(names).not.toEqual(
      [
        "Cross-functional Team Lead",
        "HR / People Partner",
        "Hiring Manager",
        "Hiring Manager's Executive",
        "Recruiter",
      ].sort(),
    );
    const manager = roles.find((role) => role.roleKey === "hiring_manager");
    expect(manager?.likelyTitles[0]).toBe("Director of Engineering");
    expect(manager?.evidence.some((item) => item.kind === "FACT")).toBe(true);
    expect(roles.some((role) => /robot|reliab|product manager/i.test(role.name))).toBe(true);

    const accountant = identifyHiringTeamRoles({
      job: fixtureJob({
        title: "Accountant",
        companyName: "Northwind Books",
        reportingLine: "Controller",
        responsibilities: ["Close the monthly books"],
        requiredItems: ["CPA"],
        preferredItems: [],
        scorecard: { mission: null, outcomes: [], competencies: [] },
      }),
      research: null,
      includeResearch: false,
    });
    expect(accountant.some((role) => /robot/i.test(role.name))).toBe(false);
    expect(
      accountant.find((role) => role.roleKey === "hiring_manager")?.likelyTitles[0],
    ).toBe("Controller");
  });

  it("drafts impact and talking points and keeps roles distinct", () => {
    const job = fixtureJob();
    const roles = identifyHiringTeamRoles({
      job,
      research: null,
      includeResearch: false,
    });
    const narratives = differentiateNarratives({
      roles,
      narratives: roles.map((role) => draftHiringTeamRole(role, job)),
    });
    expect(narratives.every((item) => item.impact.text.length > 0)).toBe(true);
    expect(narratives.every((item) => item.talkingPoints.length > 0)).toBe(true);
    const indirect = roles.findIndex((role) => role.involvement === "INDIRECT");
    expect(narratives[indirect]?.interviewStage).toBeNull();
    const pairs = findNearDuplicatePersonaPairs(
      narratives.map((narrative, index) => {
        const lists = narrativeLists(narrative);
        return {
          id: roles[index]!.roleKey,
          name: roles[index]!.name,
          painPoints: lists.painPoints,
          messagingNotes: lists.messagingNotes,
        };
      }),
    );
    expect(pairs).toEqual([]);
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
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("10");
    expect(HIRING_TEAM_IDENTIFICATION_PROMPT_VERSION).toBe("1");
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
    expect(stored.narrative?.impact?.text).toBeTruthy();
    expect((stored.narrative?.talkingPoints ?? []).length).toBeGreaterThan(0);
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

    const other = rolesA.find((role) => role.id !== manager!.id)!;
    await rebuildApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: other.id,
    });
    const rebuilt = await prisma.persona.findFirst({ where: { id: other.id } });
    expect(rebuilt?.setupStatus).toBe("NEEDS_REVIEW");
    const rebuiltJson = rebuilt?.profileJson as { narrative?: { impact?: { text?: string } } };
    expect(rebuiltJson.narrative?.impact?.text).toBeTruthy();

    await removeApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      personaId: other.id,
    });
    expect(await prisma.persona.findFirst({ where: { id: other.id, archivedAt: null } })).toBeNull();

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
});
