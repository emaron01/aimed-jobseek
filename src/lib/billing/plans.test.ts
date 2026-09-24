import { describe, expect, it } from "vitest";
import {
  COMPANY_CREDIT_BLOCK,
  BILLING_PLAN_COMPED,
  BILLING_PLAN_ENTERPRISE,
  BILLING_PLAN_STANDARD,
  BILLING_PLAN_TEAM,
  creditExpiryDate,
  getPlanDefinition,
  planAllowsSelfServeSeatChanges,
  planUsesInvoicedBilling,
  planUsesPerUserCompanyAllowance,
  resolveEntitlementsForStatus,
} from "@/lib/billing/plans";
import {
  effectiveCompanyResearchLimit,
  nextCreditExpiry,
  sumActiveCreditCompanies,
  companiesFromCreditCheckoutBlocks,
} from "@/lib/billing/company-research-credits-math";
import {
  requiresStripeCheckout,
  shouldSendBillingTransactionalEmail,
} from "@/lib/billing/billing-state";
import {
  formatResearchQuotaBlockedMessage,
  formatTrialResearchExhausted,
} from "@/lib/usage/research-allowance";

describe("billing plans catalog", () => {
  it("defines COMPED outside Stripe and STANDARD as sellable with trial overlay", () => {
    const comped = getPlanDefinition(BILLING_PLAN_COMPED);
    const standard = getPlanDefinition(BILLING_PLAN_STANDARD);

    expect(comped?.requiresStripe).toBe(false);
    expect(comped?.sellable).toBe(false);
    expect(comped?.trialEntitlements).toBeNull();

    expect(standard?.sellable).toBe(true);
    expect(standard?.requiresStripe).toBe(true);
    expect(standard?.trialDays).toBe(7);
    expect(standard?.trialEntitlements?.activeResearchedCompanyLimit).toBe(25);
    expect(standard?.entitlements.activeResearchedCompanyLimit).toBe(100);
    expect(standard?.entitlements.monthlyEmailSendLimit).toBe(1000);
    expect(standard?.entitlements.dailyEmailSendWarningLimit).toBe(50);
  });

  it("resolves trial vs active entitlements for STANDARD", () => {
    expect(
      resolveEntitlementsForStatus({
        planCode: "STANDARD",
        billingStatus: "TRIALING",
      })?.activeResearchedCompanyLimit,
    ).toBe(25);
    expect(
      resolveEntitlementsForStatus({
        planCode: "STANDARD",
        billingStatus: "ACTIVE",
      })?.activeResearchedCompanyLimit,
    ).toBe(100);
  });

  it("models Enterprise product capabilities separately from collection state", () => {
    expect(planUsesPerUserCompanyAllowance(BILLING_PLAN_ENTERPRISE)).toBe(true);
    expect(planUsesInvoicedBilling(BILLING_PLAN_ENTERPRISE)).toBe(true);
    expect(planAllowsSelfServeSeatChanges(BILLING_PLAN_ENTERPRISE)).toBe(false);
    expect(planAllowsSelfServeSeatChanges(BILLING_PLAN_TEAM)).toBe(true);
    expect(
      requiresStripeCheckout({
        planCode: BILLING_PLAN_ENTERPRISE,
        billingStatus: "UNPAID",
        stripeSubscriptionId: null,
      }),
    ).toBe(false);
    expect(
      requiresStripeCheckout({
        planCode: BILLING_PLAN_TEAM,
        billingStatus: "UNPAID",
        stripeSubscriptionId: null,
      }),
    ).toBe(true);
  });

  it("never sends billing email to comped orgs", () => {
    expect(
      shouldSendBillingTransactionalEmail({
        planCode: "COMPED",
        billingStatus: "FREE",
      }),
    ).toBe(false);
    expect(
      shouldSendBillingTransactionalEmail({
        planCode: "STANDARD",
        billingStatus: "TRIALING",
        stripeCustomerId: "cus_x",
      }),
    ).toBe(true);
  });

  it("formats trial end with days remaining", async () => {
    const { formatTrialEndsSummary, billingPlanDescription } = await import(
      "@/lib/billing/billing-state"
    );
    const ends = new Date("2026-09-15T12:00:00.000Z");
    const now = new Date("2026-09-10T12:00:00.000Z");
    expect(formatTrialEndsSummary({ trialEndsAt: ends, now })).toContain(
      "5 days remaining",
    );
    expect(
      billingPlanDescription({
        planCode: "STANDARD",
        billingStatus: "TRIALING",
      }),
    ).toContain("25 companies");
    expect(
      billingPlanDescription({
        planCode: "STANDARD",
        billingStatus: "ACTIVE",
      }),
    ).toContain("100 companies");
    expect(
      billingPlanDescription({
        planCode: "STANDARD",
        billingStatus: "ACTIVE",
        activeResearchedCompanyLimit: 75,
        dailyEmailSendWarningLimit: 40,
        monthlyEmailSendLimit: 800,
      }),
    ).toContain("75 companies");
    expect(
      billingPlanDescription({
        planCode: "COMPED",
        billingStatus: "FREE",
        activeResearchedCompanyLimit: 50,
      }),
    ).not.toMatch(/send through|send up to|sending/i);
    expect(
      billingPlanDescription({
        planCode: "STANDARD",
        billingStatus: "ACTIVE",
        activeResearchedCompanyLimit: 75,
        dailyEmailSendWarningLimit: 40,
        monthlyEmailSendLimit: 800,
      }),
    ).not.toMatch(/send through|send up to|sending/i);
  });

  it("portal and checkout return URLs use APP_URL helper", async () => {
    const portal = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/billing/create-portal-session.ts", "utf8"),
    );
    const checkout = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/billing/create-checkout-session.ts", "utf8"),
    );
    const gate = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/billing/checkout-gate.ts", "utf8"),
    );
    const paths = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/billing/paths.ts", "utf8"),
    );
    expect(portal).toContain("billingAppBaseUrl()");
    expect(portal).toContain("/settings/billing");
    expect(checkout).toContain("billingAppBaseUrl()");
    expect(checkout).toContain("/onboarding/subscribe?checkout=canceled");
    expect(paths).toContain('"/onboarding/subscribe"');
    expect(paths).toContain('"/onboarding/eula"');
    expect(gate).toContain("ONBOARDING_SUBSCRIBE_PATH");
    expect(gate).toContain("ONBOARDING_EULA_PATH");
  });

  it("uses conversion copy when trial research is exhausted", () => {
    expect(
      formatResearchQuotaBlockedMessage({
        used: 25,
        limit: 25,
        billingStatus: "TRIALING",
        trialEndsAt: new Date("2026-09-17T00:00:00.000Z"),
        planCode: BILLING_PLAN_TEAM,
      }),
    ).toContain("trial research allowance of 25");
    expect(
      formatResearchQuotaBlockedMessage({
        used: 25,
        limit: 25,
        billingStatus: "TRIALING",
        trialEndsAt: new Date("2026-09-17T00:00:00.000Z"),
        planCode: BILLING_PLAN_TEAM,
      }),
    ).toContain("converts to Team on");
    expect(
      formatResearchQuotaBlockedMessage({
        used: 25,
        limit: 25,
        billingStatus: "TRIALING",
        trialEndsAt: new Date("2026-09-17T00:00:00.000Z"),
        planCode: BILLING_PLAN_STANDARD,
      }),
    ).toContain("100 companies");
    expect(formatTrialResearchExhausted({ trialLimit: 25 })).toContain(
      "includes 100 companies",
    );
  });

  it("keeps add-capacity copy for active paid accounts", () => {
    expect(
      formatResearchQuotaBlockedMessage({
        used: 100,
        limit: 100,
        billingStatus: "ACTIVE",
      }),
    ).toContain("Add capacity in Billing");
  });

  it("treats company credits as a one-time 100-unit pack with 12-month expiry", () => {
    expect(COMPANY_CREDIT_BLOCK.kind).toBe("company_credit_block");
    expect(COMPANY_CREDIT_BLOCK.units).toBe(100);
    expect(COMPANY_CREDIT_BLOCK.expiryMonths).toBe(12);
  });

  it("computes expiry 12 UTC months from grant", () => {
    const granted = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
    const expires = creditExpiryDate(granted, 12);
    expect(expires.toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
});

describe("company research credit math", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("multiplies Checkout blocks by 100 companies per block", () => {
    expect(companiesFromCreditCheckoutBlocks(1, 100)).toBe(100);
    expect(companiesFromCreditCheckoutBlocks(3, 100)).toBe(300);
    expect(companiesFromCreditCheckoutBlocks(0, 100)).toBe(0);
  });

  it("sums only unexpired packs into the effective allowance", () => {
    const packs = [
      {
        quantity: 100,
        expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      },
      {
        quantity: 100,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
      },
      {
        quantity: 50,
        expiresAt: new Date("2026-12-01T00:00:00.000Z"),
      },
    ];

    expect(sumActiveCreditCompanies(packs, now)).toBe(150);
    expect(effectiveCompanyResearchLimit(100, packs, now)).toBe(250);
    expect(nextCreditExpiry(packs, now)?.toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
  });

  it("drops expired capacity without changing the plan base", () => {
    const packs = [
      {
        quantity: 100,
        expiresAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ];
    expect(sumActiveCreditCompanies(packs, now)).toBe(0);
    expect(effectiveCompanyResearchLimit(100, packs, now)).toBe(100);
    expect(nextCreditExpiry(packs, now)).toBeNull();
  });
});
