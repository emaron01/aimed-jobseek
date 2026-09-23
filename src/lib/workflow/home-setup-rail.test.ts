import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { voiceReadiness } from "@/lib/voice/types";
import {
  buildHomeSetupRail,
  resolveHomeSetupFocus,
} from "@/lib/workflow/home-setup-rail";
import { getProductCampaignReadiness } from "@/lib/workflow/product-campaign-readiness";
import { countedNoun, vocab } from "@/lib/product-config";

describe("home setup rail", () => {
  it("matches campaign stage rail green-check pattern on Home", () => {
    const home = readFileSync("src/app/(app)/page.tsx", "utf8");
    const rail = readFileSync("src/components/HomeSetupRail.tsx", "utf8");
    const campaignRail = readFileSync(
      "src/components/CampaignStageRail.tsx",
      "utf8",
    );
    expect(home).toContain("HomeSetupRail");
    expect(home).toContain("workflow.setupRail");
    expect(rail).toContain('bg-emerald-600 text-white');
    expect(rail).toContain("{step.completed ? \"✓\" : step.number}");
    expect(campaignRail).toContain('bg-emerald-600 text-white');
  });

  it("explains profile approval gaps instead of a bare count", () => {
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(0),
      productTotal: 2,
      productApprovedCount: 1,
      productIncomplete: [
        getProductCampaignReadiness({
          approvalStatus: "NEEDS_REVIEW",
          icps: [{ criteria: [{ id: "c1" }] }],
          personas: [{ id: "p1" }],
        }),
      ],
      icpCount: 1,
      emailConnected: false,
      emailReconnectRequired: false,
    });
    const products = steps.find((step) => step.key === "products");
    expect(products?.completed).toBe(true);
    expect(products?.detail).toBe(
      `${countedNoun(2, vocab.product)} · 1 needs approval`,
    );
    expect(steps.find((step) => step.key === "voice")?.detail).toBe(
      "No samples yet",
    );
    expect(steps.find((step) => step.key === "email")?.detail).toBe(
      "Not connected",
    );
    expect(steps.map((step) => step.key)).not.toContain("lists");
    expect(steps.map((step) => step.key)).not.toContain("contacts");
    expect(resolveHomeSetupFocus(steps)).toBe("voice");
  });

  it("does not mark Profile complete until a profile is approved", () => {
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(3),
      productTotal: 1,
      productApprovedCount: 0,
      productIncomplete: [
        getProductCampaignReadiness({
          approvalStatus: "NEEDS_REVIEW",
          icps: [{ criteria: [{ id: "c1" }] }],
          personas: [{ id: "p1" }],
        }),
      ],
      icpCount: 1,
      emailConnected: true,
      emailReconnectRequired: false,
    });
    const products = steps.find((step) => step.key === "products");
    expect(products?.completed).toBe(false);
    expect(products?.detail).toBe(
      `${countedNoun(1, vocab.product)} · 1 needs approval`,
    );
    expect(resolveHomeSetupFocus(steps)).toBe("products");
  });

  it("lists Target Employers as a rail step and omits Lists and Contacts", () => {
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(3),
      productTotal: 1,
      productApprovedCount: 1,
      productIncomplete: [],
      icpCount: 0,
      emailConnected: true,
      emailReconnectRequired: false,
    });
    expect(steps.map((step) => step.key)).toEqual([
      "voice",
      "products",
      "icps",
      "email",
    ]);
    expect(steps.find((step) => step.key === "icps")).toMatchObject({
      label: vocab.icp.nav,
      href: "/icps",
      completed: false,
    });
    expect(resolveHomeSetupFocus(steps)).toBe("icps");
  });

  it("stays visible and focused on the last step when everything is green", () => {
    const steps = buildHomeSetupRail({
      voice: voiceReadiness(3),
      productTotal: 1,
      productApprovedCount: 1,
      productIncomplete: [],
      icpCount: 2,
      emailConnected: true,
      emailReconnectRequired: false,
    });
    expect(steps.every((step) => step.completed)).toBe(true);
    expect(resolveHomeSetupFocus(steps)).toBe("email");
    expect(steps.map((step) => step.href)).toEqual([
      "/settings/voice",
      "/products",
      "/icps",
      "/settings/email",
    ]);
  });
});
