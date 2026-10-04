import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HomeSetupRail } from "@/components/HomeSetupRail";
import {
  buildHomeSetupRail,
  resolveHomeSetupFocus,
} from "@/lib/workflow/home-setup-rail";
import { voiceReadiness } from "@/lib/voice/types";
import { vocab } from "@/lib/product-config";

const prismaMock = vi.hoisted(() => ({
  product: { findMany: vi.fn() },
  campaign: { findMany: vi.fn() },
  voiceSample: { count: vi.fn() },
  contactList: { count: vi.fn() },
  contact: { count: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/mailbox/data", () => ({
  getMailboxConnectionView: vi.fn(async () => null),
}));
vi.mock("@/lib/cadence/dashboard", () => ({
  getDueContactsForUser: vi.fn(async () => []),
}));
vi.mock("@/lib/cadence/application-reminders", () => ({
  getDueApplicationReminders: vi.fn(async () => []),
}));

import { getHomeWorkflow } from "@/lib/workflow/home";

function productFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "product_1",
    name: "Forecast",
    approvalStatus: "APPROVED",
    icps: [
      {
        id: "icp_1",
        name: "Primary target",
        lastInterpretedAt: null,
        criteria: [
          {
            evidenceClass: "TARGETED_SEARCH",
            targetedSearchDecision: null,
          },
        ],
      },
    ],
    personas: [{ id: "persona_1", name: "Revenue leader" }],
    setupRuns: [
      {
        suggestedPersonasJson: [
          { suggestionKey: "rev", name: "Revenue leader" },
        ],
      },
    ],
    ...overrides,
  };
}

describe("home workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.campaign.findMany.mockResolvedValue([]);
    prismaMock.voiceSample.count.mockResolvedValue(3);
    prismaMock.contactList.count.mockResolvedValue(0);
    prismaMock.contact.count.mockResolvedValue(0);
  });

  it("renders pre-setup state when a Personal Profile is missing", async () => {
    prismaMock.product.findMany.mockResolvedValue([]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(false);
  });

  it("treats an approved Personal Profile as campaign-ready without a Target Employer", async () => {
    prismaMock.product.findMany.mockResolvedValue([productFixture({ icps: [] })]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(true);
    expect(result.campaignProducts[0]?.ready).toBe(true);
  });

  it("enables campaigns when ICP has criteria even if lastInterpretedAt is null", async () => {
    prismaMock.product.findMany.mockResolvedValue([productFixture()]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(true);
    expect(result.campaignProducts).toEqual([
      expect.objectContaining({
        id: "product_1",
        name: "Forecast",
        ready: true,
        omissionReason: null,
      }),
    ]);
    expect(result.product.label).toBe("Approved");
    expect(result.icp.done).toBe(true);
    expect(result.icp.label).toBe("Saved");
    expect(result.icp.criterionCount).toBe(1);
    expect(result.icp.needsLookupCount).toBe(1);
    expect(result.icp.count).toBe(1);
    expect(result.icp.detail).toBe("Primary target");
    expect(result.personas.names).toEqual(["Revenue leader"]);
  });

  it("does not count Good to know TARGETED_SEARCH toward lookup count", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      productFixture({
        icps: [
          {
            id: "icp_1",
            name: "Primary target",
            lastInterpretedAt: null,
            criteria: [
              {
                evidenceClass: "TARGETED_SEARCH",
                targetedSearchDecision: null,
                tier: "SECONDARY",
              },
              {
                evidenceClass: "TARGETED_SEARCH",
                targetedSearchDecision: null,
                tier: "PRIMARY",
              },
            ],
          },
        ],
      }),
    ]);
    const result = await getHomeWorkflow("org_1");
    expect(result.icp.needsLookupCount).toBe(1);
  });

  it("shows a saved count when more than one ICP has criteria", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      productFixture({
        icps: [
          {
            id: "icp_1",
            name: "Primary target",
            lastInterpretedAt: null,
            criteria: [{ evidenceClass: "LIST_DATA", targetedSearchDecision: null }],
          },
          {
            id: "icp_2",
            name: "Secondary target",
            lastInterpretedAt: null,
            criteria: [{ evidenceClass: "LIST_DATA", targetedSearchDecision: null }],
          },
        ],
      }),
    ]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(true);
    expect(result.icp.done).toBe(true);
    expect(result.icp.count).toBe(2);
    expect(result.icp.detail).toBe("2 saved");
    expect(result.icp.actionLabel).toBe(`Review ${vocab.icp.plural}`);
    expect(result.icp.href).toBe("/setup/product_1/icps");
  });

  it("does not treat an ICP without criteria as complete", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      productFixture({
        icps: [
          {
            id: "icp_empty",
            name: "Draft ICP",
            lastInterpretedAt: null,
            criteria: [],
          },
        ],
      }),
    ]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(true);
    expect(result.campaignProducts[0]).toMatchObject({
      id: "product_1",
      ready: true,
      blockers: [],
    });
    expect(result.icp.done).toBe(false);
    expect(result.icp.label).toBe("Not started");
    expect(result.icp.count).toBe(0);
  });

  it("still returns existing campaigns when setup is incomplete", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      productFixture({ approvalStatus: "DRAFT", icps: [] }),
    ]);
    prismaMock.campaign.findMany.mockResolvedValue([
      {
        id: "camp_1",
        name: "Web Follow-ups",
        context: "",
        icp: { name: "Primary target" },
        persona: { name: "CRO" },
        personasInPlay: [],
        offerName: null,
        offer: null,
        contacts: [],
      },
    ]);
    const result = await getHomeWorkflow("org_1");
    expect(result.setupComplete).toBe(false);
    expect(result.campaigns).toEqual([
      expect.objectContaining({
        id: "camp_1",
        name: "Web Follow-ups",
      }),
    ]);
  });
});

describe("workflow view contracts", () => {
  it("hides Target Employers on the Home setup rail; lists stay in nav only", () => {
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(0),
      productTotal: 0,
      productApprovedCount: 0,
      productIncomplete: [],
      icpCount: 0,
      emailConnected: false,
      emailReconnectRequired: false,
    });
    expect(steps.some((step) => step.href === "/icps")).toBe(false);
    expect(steps.map((step) => step.key)).not.toContain("lists");
    expect(steps.map((step) => step.key)).not.toContain("contacts");

    const railHtml = renderToStaticMarkup(
      createElement(HomeSetupRail, {
        steps,
        focusKey: resolveHomeSetupFocus(steps),
      }),
    );
    expect(railHtml).not.toContain('href="/icps"');
    expect(railHtml).not.toContain(`>${vocab.icp.nav}<`);
    expect(railHtml).not.toContain('href="/lists"');
    expect(railHtml).toContain('aria-label="Setup"');

    const page = readFileSync("src/app/(app)/page.tsx", "utf8");
    expect(page).toContain("HomeSetupRail");
    expect(page).toContain("workflow.campaigns.map");
    expect(page).toContain('HomeNavLink href="/lists"');
    expect(page).toContain("Finish ${vocab.product.singular} setup first");
    expect(page).toContain("vocab.campaign.plural} stay available");
  });

  it("does not render unsupported engagement metrics", () => {
    const roots = ["src/app", "src/components"];
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.name.endsWith(".tsx")) files.push(path);
      }
    };
    roots.forEach(visit);
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/\b(?:reply count|open rate|click rate)\b/i);
  });
});
