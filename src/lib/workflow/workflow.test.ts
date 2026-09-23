import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HomeSetupRail } from "@/components/HomeSetupRail";
import {
  buildCampaignStages,
  resolveCampaignStage,
} from "@/lib/workflow/campaign-stages";
import {
  buildHomeSetupRail,
  resolveHomeSetupFocus,
} from "@/lib/workflow/home-setup-rail";
import {
  firstUnresolvedCriterion,
  QUALIFICATION_BUCKET_LABELS,
  QUALIFICATION_BUCKETS,
  scoreLabelToBucket,
} from "@/lib/workflow/qualification";
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

  it.each([
    ["Product", []],
    ["ICP", [productFixture({ icps: [] })]],
    ["Persona", [productFixture({ personas: [] })]],
  ])(
    "renders pre-setup state when %s is missing",
    async (_missing, products) => {
      prismaMock.product.findMany.mockResolvedValue(products);
      const result = await getHomeWorkflow("org_1");
      expect(result.setupComplete).toBe(false);
    },
  );

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
    expect(result.icp.actionLabel).toBe("Review ICPs");
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
    expect(result.setupComplete).toBe(false);
    expect(result.campaignProducts[0]).toMatchObject({
      id: "product_1",
      ready: false,
      blockers: expect.arrayContaining(["Needs an ICP with criteria"]),
    });
    expect(result.icp.done).toBe(false);
    expect(result.icp.label).toBe("Not started");
    expect(result.icp.count).toBe(0);
  });

  it("still returns existing campaigns when setup is incomplete", async () => {
    prismaMock.product.findMany.mockResolvedValue([
      productFixture({ icps: [] }),
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

describe("campaign stage rail", () => {
  it("marks completed stages, permits backward stages, and explains a blocked Emails stage", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 2,
      survivingCompanyCount: 1,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
    });
    expect(stages.find((stage) => stage.key === "setup")?.completed).toBe(true);
    expect(stages.find((stage) => stage.key === "companies")?.available).toBe(
      true,
    );
    expect(stages.find((stage) => stage.key === "contacts")?.available).toBe(
      true,
    );
    expect(stages.find((stage) => stage.key === "emails")).toMatchObject({
      available: false,
      unavailableReason: "At least one qualified contact is required.",
    });
    expect(resolveCampaignStage("companies", stages)).toBe("companies");
    expect(resolveCampaignStage("emails", stages)).toBe("contacts");
  });

  it("blocks Contacts when company results have no surviving Good company", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 3,
      survivingCompanyCount: 0,
      qualifiedContactCount: 0,
      generatedEmailCount: 0,
      sentEmailCount: 0,
    });
    expect(stages.find((stage) => stage.key === "contacts")).toMatchObject({
      available: false,
      unavailableReason:
        "At least one company must be in Good before reviewing contacts.",
    });
  });
  it("maps legacy send stage deep links onto emails", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 1,
      survivingCompanyCount: 1,
      qualifiedContactCount: 1,
      generatedEmailCount: 1,
      sentEmailCount: 0,
    });
    expect(stages.map((stage) => stage.key)).toEqual([
      "setup",
      "list",
      "companies",
      "contacts",
      "emails",
      "report",
    ]);
    expect(stages.find((stage) => stage.key === "emails")?.number).toBe(8);
    expect(stages.find((stage) => stage.key === "report")?.number).toBe(9);
    expect(resolveCampaignStage("send", stages)).toBe("emails");
  });
});

describe("qualification bucket contract", () => {
  it("uses identical Ready / Check / Left out ordering for reps", () => {
    expect(
      QUALIFICATION_BUCKETS.map((key) => QUALIFICATION_BUCKET_LABELS[key]),
    ).toEqual([
      "Ready to include",
      "Check before including",
      "Left out",
    ]);
  });

  it("sends unmatched titles to Needs review and all-excluded contacts to Excluded", () => {
    expect(
      scoreLabelToBucket("FAIR", {
        personaMatch: { status: "UNKNOWN", matchedPersonaId: null },
        icpQualification: { bucket: "GOOD" },
      }),
    ).toBe("NEEDS_REVIEW");
    expect(
      scoreLabelToBucket("DISQUALIFIED", {
        personaMatch: { status: "EXCLUDED", matchedPersonaId: null },
      }),
    ).toBe("EXCLUDED");
  });

  it("surfaces an unresolved criterion for a research action", () => {
    expect(
      firstUnresolvedCriterion([
        {
          criterionId: "criterion_1",
          name: "Forecast ownership",
          assessment: "NEUTRAL",
          evidenceOutcome: "UNVERIFIABLE",
          reasoning: "Can't confirm forecast ownership vs CRM administration.",
        },
      ]),
    ).toEqual({
      criterionId: "criterion_1",
      name: "Forecast ownership",
      reasoning: "Can't confirm forecast ownership vs CRM administration.",
    });
  });
});

describe("workflow view contracts", () => {
  it("keeps every campaign stage on the workspace and supplies actionable empty states", () => {
    const page = readFileSync("src/app/(app)/campaigns/[id]/page.tsx", "utf8");
    for (const stage of [
      "setup",
      "list",
      "companies",
      "contacts",
      "emails",
      "report",
    ]) {
      expect(page).toContain(`"${stage}"`);
    }
    expect(page).not.toContain('currentStage === "send"');
    expect(page).toContain("Compare drafts");
    expect(page).toContain("No company qualification results yet");
    expect(page).toContain("No ${vocab.contact.singular} qualification results yet");
    expect(page).toContain("Next: attach ${vocab.contact.plural}");
    expect(page).toContain("CampaignStageShell");
    expect(page).toContain("An offer is optional");
    expect(page).toContain("No ${vocab.campaign.singular} activity has been recorded yet");
  });

  it("redirects stage deep links into the persistent campaign workspace", () => {
    const redirectPage = readFileSync(
      "src/app/(app)/campaigns/[id]/[stage]/page.tsx",
      "utf8",
    );
    expect(redirectPage).toContain(
      "redirect(`/campaigns/${id}?stage=${stage}`)",
    );
    expect(redirectPage).toContain('send: "emails"');
    expect(redirectPage).toContain(
      "redirect(`/campaigns/${id}?stage=${redirected}`)",
    );
  });

  it("unlocks Report from sentEmailCount without a Send stage", () => {
    const stages = buildCampaignStages({
      setupComplete: true,
      hasListData: true,
      companyResultCount: 1,
      survivingCompanyCount: 1,
      qualifiedContactCount: 1,
      generatedEmailCount: 1,
      sentEmailCount: 1,
    });
    expect(stages.find((stage) => stage.key === "report")).toMatchObject({
      number: 9,
      available: true,
      unavailableReason: null,
    });
    expect(stages.map((stage) => stage.key)).not.toContain("send");
  });

  it("renders Lists on the Home setup rail; campaigns stay listed when setup is incomplete", () => {
    // Incomplete-setup campaign data: "still returns existing campaigns…" above.
    // Smoke `/` only asserts the sidebar shell — not Home→Lists. Prove the link
    // in rendered markup (setup rail owns Lists; header also keeps a Lists nav).
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(0),
      productTotal: 0,
      productReadyCount: 0,
      productIncomplete: [],
      listCount: 0,
      contactCount: 0,
      emailConnected: false,
      emailReconnectRequired: false,
    });
    expect(steps.find((step) => step.key === "lists")).toMatchObject({
      label: vocab.list.Plural,
      href: "/lists",
    });

    const railHtml = renderToStaticMarkup(
      createElement(HomeSetupRail, {
        steps,
        focusKey: resolveHomeSetupFocus(steps),
      }),
    );
    expect(railHtml).toContain('href="/lists"');
    expect(railHtml).toContain(`>${vocab.list.Plural}<`);
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
