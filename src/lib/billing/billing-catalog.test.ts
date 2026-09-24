import { describe, expect, it } from "vitest";
import {
  catalogFloorsToResolved,
  defaultBillingCatalogSetting,
  findCatalogPlan,
  parseBillingCatalogSetting,
  resolveCatalogEntitlementsForStatus,
  PLATFORM_SETTING_BILLING_CATALOG,
} from "@/lib/billing/billing-catalog";
import {
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  BILLING_PLAN_ENTERPRISE,
} from "@/lib/billing/plans";
import { billingPlanLabel } from "@/lib/billing/billing-state";
import { brand, vocab } from "@/lib/product-config";

describe("billing.catalog", () => {
  it("seeds Standard with current floors and marketing bullets", () => {
    const catalog = defaultBillingCatalogSetting();
    const standard = findCatalogPlan(catalog, BILLING_PLAN_STANDARD);
    expect(standard).toBeTruthy();
    expect(standard!.displayName).toBe("Standard");
    expect(standard!.sellable).toBe(true);
    expect(standard!.entitlementFloors.trial?.companyResearchLimit).toBe(25);
    expect(standard!.entitlementFloors.paid.companyResearchLimit).toBe(100);
    expect(standard!.entitlementFloors.paid.dailyAiGenerationLimit).toBe(500);
    expect(standard!.companyCredits?.blockSize).toBe(100);
    expect(standard!.tagline).toBe(`For individual ${vocab.seeker.plural}`);
    expect(standard!.featureBullets.length).toBeGreaterThan(2);
    expect(PLATFORM_SETTING_BILLING_CATALOG).toBe("billing.catalog");
  });

  it("seeds Team and Enterprise with per-seat floors", () => {
    const catalog = defaultBillingCatalogSetting();
    const team = findCatalogPlan(catalog, BILLING_PLAN_TEAM);
    const enterprise = findCatalogPlan(catalog, BILLING_PLAN_ENTERPRISE);
    expect(team?.sellable).toBe(true);
    expect(team?.entitlementFloors.paid.companiesPerSeat).toBe(150);
    expect(team?.entitlementFloors.paid.seatMin).toBe(2);
    expect(team?.entitlementFloors.paid.seatMax).toBe(10);
    expect(enterprise?.featureBullets.some((b) => b.includes(brand.appName))).toBe(
      true,
    );
    expect(enterprise?.sellable).toBe(false);
    expect(enterprise?.entitlementFloors.paid.seatMax).toBeNull();
    expect(team?.companyCredits?.blockSize).toBe(100);
    expect(enterprise?.companyCredits?.blockSize).toBe(100);
    expect(billingPlanLabel("PREMIUM")).toBe("Team");
  });

  it("parses a round-tripped default catalog", () => {
    const seeded = defaultBillingCatalogSetting();
    const parsed = parseBillingCatalogSetting(seeded);
    expect(parsed).toEqual(seeded);
  });

  it("rejects invalid payloads", () => {
    expect(parseBillingCatalogSetting(null)).toBeNull();
    expect(parseBillingCatalogSetting({ plans: [] })).toBeNull();
    expect(
      parseBillingCatalogSetting({
        plans: [{ planCode: "STANDARD", displayName: "X" }],
      }),
    ).toBeNull();
  });

  it("resolves trial vs paid floors from catalog", () => {
    const catalog = defaultBillingCatalogSetting();
    const trial = resolveCatalogEntitlementsForStatus({
      catalog,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "TRIALING",
    });
    const paid = resolveCatalogEntitlementsForStatus({
      catalog,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "ACTIVE",
    });
    expect(trial?.activeResearchedCompanyLimit).toBe(25);
    expect(paid?.activeResearchedCompanyLimit).toBe(100);
    expect(paid?.dailyAiGenerationLimit).toBe(500);
  });

  it("falls back to plans.ts when catalog is null", () => {
    const paid = resolveCatalogEntitlementsForStatus({
      catalog: null,
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "ACTIVE",
    });
    expect(paid?.activeResearchedCompanyLimit).toBe(100);
    expect(
      catalogFloorsToResolved(
        defaultBillingCatalogSetting().plans[0]!.entitlementFloors.paid,
      ).dailyEmailSendWarningLimit,
    ).toBe(50);
  });
});
