import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HIRING_TEAM_TEMPLATE_DEFAULTS } from "@/lib/product-config/hiring-team-templates";
import {
  hiringTeamEvidenceExcerpts,
  likelyTitlesForTemplate,
} from "@/lib/hiring-team/evidence";
import { applicationPersonaOptions } from "@/lib/hiring-team/scope";
import {
  addApplicationHiringTeamRole,
  savePersonaAsTemplate,
  syncApplicationHiringTeam,
} from "@/lib/hiring-team/build";
import { ensureDefaultPersonaTemplates } from "@/lib/hiring-team/templates";
import { findNearDuplicatePersonaPairs } from "@/lib/persona/persona-differentiation";
import { PERSONA_SYNTHESIS_PROMPT_VERSION } from "@/lib/persona-research/contract";
import { buildPersonaSynthesisMessages } from "@/lib/persona-research/prompt";
import { NORMAL_JOB_MODEL } from "@/lib/job-requirement/fixtures";
import { vocab } from "@/lib/product-config";
import { buildSidebarNavItems } from "@/lib/auth/user-menu";
import { hasTestDatabase } from "@/test/database";

describe("hiring team evidence and selectors", () => {
  it("uses the reporting line as a Hiring Manager title", () => {
    expect(
      likelyTitlesForTemplate({
        templateKey: "hiring_manager",
        likelyTitles: ["Hiring Manager"],
        reportingLine: NORMAL_JOB_MODEL.reportingLine,
      }),
    ).toEqual(["Director of Engineering", "Hiring Manager"]);
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
    expect(PERSONA_SYNTHESIS_PROMPT_VERSION).toBe("9");
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

  it("creates default templates once per organization and scopes roles to one application", async () => {
    await ensureDefaultPersonaTemplates(prisma, organizationId);
    const first = await prisma.personaTemplate.findMany({
      where: { organizationId },
    });
    expect(first.map((row) => row.templateKey).sort()).toEqual(
      HIRING_TEAM_TEMPLATE_DEFAULTS.map((row) => row.templateKey).sort(),
    );
    await prisma.personaTemplate.delete({
      where: { id: first.find((row) => row.templateKey === "recruiter")!.id },
    });
    await ensureDefaultPersonaTemplates(prisma, organizationId);
    const afterDelete = await prisma.personaTemplate.count({ where: { organizationId } });
    expect(afterDelete).toBe(HIRING_TEAM_TEMPLATE_DEFAULTS.length - 1);

    const appA = await application(`App A ${suffix}`);
    const appB = await application(`App B ${suffix}`);
    await requirement(appA.id, { disposition: "UNDISCLOSED" });
    await requirement(appB.id, { disposition: "UNDISCLOSED" });
    await syncApplicationHiringTeam({ organizationId, campaignId: appA.id });
    await syncApplicationHiringTeam({ organizationId, campaignId: appB.id });
    const rolesA = await prisma.persona.findMany({ where: { campaignId: appA.id } });
    const rolesB = await prisma.persona.findMany({ where: { campaignId: appB.id } });
    expect(rolesA.length).toBe(afterDelete);
    expect(rolesB.map((role) => role.id).some((id) => rolesA.some((role) => role.id === id))).toBe(
      false,
    );
    const managerTemplate = await prisma.personaTemplate.findFirst({
      where: { organizationId, templateKey: "hiring_manager" },
    });
    const manager = rolesA.find((role) => role.personaTemplateId === managerTemplate?.id);
    expect(manager?.targetTitles).toEqual(
      expect.arrayContaining(["Director of Engineering"]),
    );
    const stored = manager?.profileJson as { includeResearch?: boolean; evidence?: Array<{ text: string }> };
    expect(stored.includeResearch).toBe(false);
    expect(stored.evidence?.[0]?.text).not.toContain("second site");

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
    const refreshed = await prisma.persona.findFirst({
      where: { id: manager!.id },
    });
    const refreshedJson = refreshed?.profileJson as {
      includeResearch?: boolean;
      evidence?: Array<{ text: string }>;
    };
    expect(refreshedJson.includeResearch).toBe(true);
    expect(refreshedJson.evidence?.some((item) => item.text.includes("Opening a second site"))).toBe(
      true,
    );
    const stillOnB = await prisma.persona.findFirst({
      where: { campaignId: appB.id, id: manager!.id },
    });
    expect(stillOnB).toBeNull();

    const custom = await addApplicationHiringTeamRole({
      organizationId,
      campaignId: appA.id,
      name: "Staff Engineer interviewer",
      likelyTitles: ["Staff Engineer"],
      department: "Engineering",
      whyThisRoleMatters: "Judges technical depth on this service.",
      notes: "Panel.",
    });
    const onB = await prisma.persona.findFirst({
      where: { campaignId: appB.id, id: custom.personaId },
    });
    expect(onB).toBeNull();
    const saved = await savePersonaAsTemplate({
      organizationId,
      personaId: custom.personaId,
    });
    const template = await prisma.personaTemplate.findFirst({
      where: { id: saved.templateId, organizationId },
    });
    expect(template?.templateKey).toBeNull();
    expect(template?.name).toBe("Staff Engineer interviewer");
  });
});
