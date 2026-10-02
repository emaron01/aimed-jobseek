import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const generateStructured = vi.hoisted(() => vi.fn());
const isPersonaAiConfigured = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...actual,
    isPersonaAiConfigured,
    getPersonaAiProvider: () => ({ generateStructured }),
    isConsultationReplyAiConfigured: () => false,
  };
});

vi.mock("@/lib/ai/paid-call-gate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/paid-call-gate")>();
  return {
    ...actual,
    runPaidStructuredCall: async <T>(input: { callProvider: () => Promise<T> }) => ({
      data: await input.callProvider(),
      skipped: false,
    }),
    findPaidCallReceipt: async () => null,
  };
});

import { processApplicationJob } from "@/lib/application-jobs/process";
import { addPersonaToCheatSheet } from "@/lib/application-summary/persona-cheat-sheet";
import { stabilizeRoleKeys } from "@/lib/hiring-team/identify";
import {
  queueHiringTeamBuildDirect,
  rebuildApplicationHiringTeamRole,
  syncApplicationHiringTeam,
} from "@/lib/hiring-team/build";
import { NORMAL_JOB_MODEL } from "@/lib/job-requirement/fixtures";
import { hasTestDatabase } from "@/test/database";

const JOB_TEXT = [
  "The product or digital risk leader owns product risk for this hire.",
  "The revenue operations leader runs the forecast for this hire.",
  "The executive sales sponsor owns the executive relationship for this hire.",
  "The channel or partnerships leader runs partners for this hire.",
].join(" ");

function identifiedRole(
  name: string,
  titles: string[],
  involvement: "DIRECT" | "INDIRECT",
  why: string,
) {
  return {
    name,
    likelyTitles: titles,
    department: "Revenue",
    involvement,
    whyInvolved: why,
    evidence: [{ claim: why, kind: "FACT" as const }],
  };
}

const IDENTIFIED = [
  identifiedRole(
    "Product or Digital Risk Leader",
    ["Chief Product Officer"],
    "DIRECT",
    "The product or digital risk leader owns product risk for this hire.",
  ),
  identifiedRole(
    "Revenue Operations Leader",
    ["Head of Revenue Operations"],
    "INDIRECT",
    "The revenue operations leader runs the forecast for this hire.",
  ),
  identifiedRole(
    "Executive Sales Sponsor",
    ["CRO"],
    "DIRECT",
    "The executive sales sponsor owns the executive relationship for this hire.",
  ),
  identifiedRole(
    "Channel or Partnerships Leader",
    ["VP Partnerships"],
    "INDIRECT",
    "The channel or partnerships leader runs partners for this hire.",
  ),
];

describe.skipIf(!hasTestDatabase())("persona activation does not rewrite other roles", () => {
  const suffix = Date.now().toString(36);
  let prisma: import("@prisma/client").PrismaClient;
  let organizationId = "";
  let userId = "";
  let campaignId = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const org = await prisma.organization.create({
      data: { name: `[TEST] Activation loss ${suffix}`, slug: `activation-loss-${suffix}` },
    });
    organizationId = org.id;
    const user = await prisma.user.create({
      data: {
        email: `activation-loss-${suffix}@example.test`,
        emailNormalized: `activation-loss-${suffix}@example.test`,
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: { organizationId, name: `Profile ${suffix}` },
    });
    const icp = await prisma.icp.create({
      data: { organizationId, productId: product.id, name: `Employer ${suffix}` },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        ownerUserId: userId,
        name: `Application ${suffix}`,
        productId: product.id,
        icpId: icp.id,
      },
    });
    campaignId = campaign.id;
    await prisma.jobRequirement.create({
      data: {
        organizationId,
        campaignId,
        rawText: JOB_TEXT,
        title: "Account Executive",
        companyName: "Acme",
        reportingLine: null,
        responsibilities: NORMAL_JOB_MODEL.responsibilities,
        requiredItems: NORMAL_JOB_MODEL.requiredItems,
        preferredItems: NORMAL_JOB_MODEL.preferredItems,
        scorecardJson: NORMAL_JOB_MODEL.scorecard,
        employerDisposition: "UNDISCLOSED",
      },
    });
    const rows = [
      ["executive", "Executive Sales Sponsor", "executive_sales_sponsor", "DIRECT", "Chief Product Officer"],
      ["channel", "Channel or Partnerships Leader", "channel_or_partnerships_leader", "INDIRECT", "Head of Revenue Operations"],
      ["product", "Product or Digital Risk Leader", "product_or_digital_risk_leader", "DIRECT", "Chief Product Officer"],
      ["revenue", "Revenue Operations Leader", "revenue_operations_leader", "INDIRECT", "Head of Revenue Operations"],
    ] as const;
    for (const [key, name, suggestionKey, involvement, title] of rows) {
      const created = await prisma.persona.create({
        data: {
          organizationId,
          productId: product.id,
          campaignId,
          name,
          suggestionKey,
          targetTitles: [title],
          whyThisPersonaMatters: `${name} already on this application.`,
          setupStatus: "NOT_STARTED",
          approvalStatus: "NOT_STARTED",
          profileJson: { involvement },
        },
      });
      ids[key] = created.id;
    }
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  function snapshot(rows: Array<{
    id: string;
    name: string;
    suggestionKey: string | null;
    targetTitles: unknown;
    whyThisPersonaMatters: string | null;
    approvalStatus: string;
    setupStatus: string;
    cheatSheetActivatedAt: Date | null;
    archivedAt: Date | null;
  }>) {
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        suggestionKey: row.suggestionKey,
        titles: JSON.stringify(row.targetTitles),
        why: row.whyThisPersonaMatters,
        approvalStatus: row.approvalStatus,
        setupStatus: row.setupStatus,
        activated: row.cheatSheetActivatedAt != null,
        archived: row.archivedAt != null,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  it("adds two personas without renaming, deleting, or duplicating the others", async () => {
    const stolen = stabilizeRoleKeys(
      IDENTIFIED.map((role) => ({
        roleKey: role.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
        name: role.name,
        likelyTitles: role.likelyTitles,
        department: role.department,
        involvement: role.involvement,
        whyInvolved: role.whyInvolved,
        evidence: role.evidence.map((item) => ({ ...item, sourceId: "job-requirement" })),
      })),
      [
        {
          suggestionKey: "executive_sales_sponsor",
          name: "Executive Sales Sponsor",
          titles: ["Chief Product Officer"],
        },
        {
          suggestionKey: "channel_or_partnerships_leader",
          name: "Channel or Partnerships Leader",
          titles: ["Head of Revenue Operations"],
        },
        {
          suggestionKey: "product_or_digital_risk_leader",
          name: "Product or Digital Risk Leader",
          titles: ["Chief Product Officer"],
        },
        {
          suggestionKey: "revenue_operations_leader",
          name: "Revenue Operations Leader",
          titles: ["Head of Revenue Operations"],
        },
      ],
    );
    expect(stolen.find((role) => role.name === "Product or Digital Risk Leader")?.roleKey).toBe(
      "product_or_digital_risk_leader",
    );
    expect(stolen.find((role) => role.name === "Executive Sales Sponsor")?.roleKey).toBe(
      "executive_sales_sponsor",
    );

    generateStructured.mockImplementation(async (request: { schemaName?: string }) => {
      if (request.schemaName === "hiring_team_identification") {
        return { data: { roles: IDENTIFIED } };
      }
      throw new Error("synthesis unavailable in this test");
    });

    const before = snapshot(
      await prisma.persona.findMany({ where: { campaignId, archivedAt: null } }),
    );
    expect(before).toHaveLength(4);

    const executive = await addPersonaToCheatSheet({
      organizationId,
      campaignId,
      personaId: ids.executive!,
      userId,
    });
    const channel = await addPersonaToCheatSheet({
      organizationId,
      campaignId,
      personaId: ids.channel!,
      userId,
    });
    expect(executive.kind).toBe("build");
    expect(channel.kind).toBe("build");
    await processApplicationJob(executive.jobId!);
    await processApplicationJob(channel.jobId!);

    expect(
      generateStructured.mock.calls.some(
        (call) => call[0]?.schemaName === "hiring_team_identification",
      ),
    ).toBe(false);

    const after = await prisma.persona.findMany({ where: { campaignId } });
    const active = after.filter((row) => row.archivedAt == null);
    expect(active).toHaveLength(4);
    expect(active.map((row) => row.name).sort()).toEqual([
      "Channel or Partnerships Leader",
      "Executive Sales Sponsor",
      "Product or Digital Risk Leader",
      "Revenue Operations Leader",
    ]);
    const byId = new Map(active.map((row) => [row.id, row]));
    expect(byId.get(ids.executive!)?.cheatSheetActivatedAt).not.toBeNull();
    expect(byId.get(ids.channel!)?.cheatSheetActivatedAt).not.toBeNull();
    expect(byId.get(ids.product!)?.cheatSheetActivatedAt).toBeNull();
    expect(byId.get(ids.revenue!)?.cheatSheetActivatedAt).toBeNull();
    for (const key of ["executive", "channel", "product", "revenue"] as const) {
      const row = byId.get(ids[key]!)!;
      const earlier = before.find((item) => item.id === row.id)!;
      expect(row.name).toBe(earlier.name);
      expect(row.suggestionKey).toBe(earlier.suggestionKey);
      expect(JSON.stringify(row.targetTitles)).toBe(earlier.titles);
      expect(row.whyThisPersonaMatters).toBe(earlier.why);
    }
    const sectionJobs = await prisma.applicationJob.findMany({
      where: { campaignId, type: "APPLICATION_SUMMARY" },
    });
    expect(sectionJobs.map((job) => job.targetId).sort()).toEqual(
      [`persona:${ids.channel}`, `persona:${ids.executive}`].sort(),
    );

    generateStructured.mockClear();
    await rebuildApplicationHiringTeamRole({
      organizationId,
      campaignId,
      personaId: ids.product!,
    });
    const direct = await queueHiringTeamBuildDirect({
      organizationId,
      campaignId,
      initiatedByUserId: userId,
    });
    for (const jobId of direct.jobIds) {
      await processApplicationJob(jobId);
    }
    expect(
      generateStructured.mock.calls.some(
        (call) => call[0]?.schemaName === "hiring_team_identification",
      ),
    ).toBe(false);
    const afterGenerate = await prisma.persona.findMany({
      where: { campaignId, archivedAt: null },
    });
    expect(afterGenerate).toHaveLength(4);
    expect(afterGenerate.map((row) => row.name).sort()).toEqual(
      active.map((row) => row.name).sort(),
    );

    const beforeSync = await prisma.persona.findMany({
      where: { campaignId, archivedAt: null },
    });
    await syncApplicationHiringTeam({ organizationId, campaignId });
    const afterSync = await prisma.persona.findMany({ where: { campaignId } });
    expect(afterSync.filter((row) => row.archivedAt == null)).toHaveLength(4);
    expect(afterSync.filter((row) => row.archivedAt != null)).toHaveLength(0);
    for (const earlier of beforeSync) {
      const row = afterSync.find((item) => item.id === earlier.id);
      expect(row?.name).toBe(earlier.name);
      expect(row?.suggestionKey).toBe(earlier.suggestionKey);
      expect(JSON.stringify(row?.targetTitles)).toBe(JSON.stringify(earlier.targetTitles));
      expect(row?.whyThisPersonaMatters).toBe(earlier.whyThisPersonaMatters);
      expect(row?.department).toBe(earlier.department);
      expect(row?.cheatSheetActivatedAt?.toISOString() ?? null).toBe(
        earlier.cheatSheetActivatedAt?.toISOString() ?? null,
      );
    }
    expect(afterSync.filter((row) => row.name === "Product or Digital Risk Leader")).toHaveLength(1);
    expect(afterSync.filter((row) => row.name === "Revenue Operations Leader")).toHaveLength(1);
  });

  it("does not make a paid call or enqueue a job while rendering", () => {
    const workspace = readFileSync("src/components/ApplicationWorkspace.tsx", "utf8");
    const page = readFileSync("src/app/(app)/campaigns/[id]/summary/page.tsx", "utf8");
    for (const source of [workspace, page]) {
      expect(source).not.toContain("runPaidStructuredCall");
      expect(source).not.toContain("enqueueApplicationJob");
      expect(source).not.toContain("queueHiringTeamBuild");
    }
  });
});
