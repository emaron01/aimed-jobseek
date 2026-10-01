import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isOrganizationReadOnly,
  isPaymentLocked,
  isSpendBlocked,
  isPastDueInGrace,
  nextPaymentLockFields,
  paymentLockUserMessage,
  PAYMENT_LOCK_GRACE_MS,
} from "@/lib/billing/payment-lock";
import {
  ACCOUNT_READ_ONLY_ACTION_MESSAGE,
  ACCOUNT_READ_ONLY_BANNER_MESSAGE,
  accountCancelScheduledMessage,
} from "@/lib/billing/account-read-only";
import { formatBillingDate } from "@/lib/billing/billing-state";
import { BILLING_PLAN_COMPED, BILLING_PLAN_STANDARD } from "@/lib/billing/plans";

describe("B3 read-only entitlement matrix", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("never route-locks (isPaymentLocked always false)", () => {
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "CANCELED",
          readOnlyStartedAt: now,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isPaymentLocked(
        {
          planCode: BILLING_PLAN_STANDARD,
          billingStatus: "PAST_DUE",
          stripeSubscriptionId: "sub_x",
          gracePeriodEndsAt: new Date("2026-09-10T12:00:00.000Z"),
        },
        now,
      ),
    ).toBe(false);
  });

  it("FREE / COMPED never read-only", () => {
    expect(
      isOrganizationReadOnly({
        planCode: BILLING_PLAN_COMPED,
        billingStatus: "FREE",
        readOnlyStartedAt: now,
      }),
    ).toBe(false);
    expect(
      isOrganizationReadOnly({
        planCode: "FREE",
        billingStatus: "FREE",
        readOnlyStartedAt: now,
      }),
    ).toBe(false);
    expect(
      isSpendBlocked({
        planCode: BILLING_PLAN_COMPED,
        billingStatus: "CANCELED",
      }),
    ).toBe(false);
  });

  it("ACTIVE / TRIALING / cancel-at-period-end are not read-only", () => {
    expect(
      isOrganizationReadOnly({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).toBe(false);
    expect(
      isSpendBlocked({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        cancelAtPeriodEnd: true,
      }),
    ).toBe(false);
  });

  it("mid-period PAST_DUE is not read-only (service through period end)", () => {
    const pastDue = {
      planCode: BILLING_PLAN_STANDARD,
      billingStatus: "PAST_DUE" as const,
      stripeSubscriptionId: "sub_x",
      currentPeriodEnd: new Date("2026-09-28T12:00:00.000Z"),
      gracePeriodEndsAt: null,
    };
    expect(isPastDueInGrace(pastDue, now)).toBe(false);
    expect(isOrganizationReadOnly(pastDue)).toBe(false);
    expect(isSpendBlocked(pastDue, now)).toBe(false);
  });

  it("readOnlyStartedAt or legacy CANCELED blocks spend/writes", () => {
    expect(
      isOrganizationReadOnly({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "ACTIVE",
        readOnlyStartedAt: now,
      }),
    ).toBe(true);
    expect(
      isSpendBlocked({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
        stripeSubscriptionId: "sub_x",
      }),
    ).toBe(true);
  });
});

describe("nextPaymentLockFields", () => {
  const now = new Date("2026-09-14T12:00:00.000Z");

  it("clears lock on ACTIVE/TRIALING", () => {
    expect(
      nextPaymentLockFields({
        previous: {
          billingStatus: "CANCELED",
          lockReason: "CANCELED",
          gracePeriodEndsAt: null,
        },
        billingStatus: "ACTIVE",
        now,
      }),
    ).toEqual({ lockReason: null, gracePeriodEndsAt: null });
  });

  it("sets CANCELED lock with no grace", () => {
    expect(
      nextPaymentLockFields({
        previous: {
          billingStatus: "ACTIVE",
          lockReason: null,
          gracePeriodEndsAt: null,
        },
        billingStatus: "CANCELED",
        now,
      }),
    ).toEqual({ lockReason: "CANCELED", gracePeriodEndsAt: null });
  });

  it("PAST_DUE no longer starts a 14-day route-lock grace", () => {
    const first = nextPaymentLockFields({
      previous: {
        billingStatus: "ACTIVE",
        lockReason: null,
        gracePeriodEndsAt: null,
      },
      billingStatus: "PAST_DUE",
      now,
    });
    expect(first.lockReason).toBe("PAYMENT_FAILED");
    expect(first.gracePeriodEndsAt).toBeNull();
    expect(PAYMENT_LOCK_GRACE_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

describe("seeker read-only messages", () => {
  it("uses exact action and banner copy", () => {
    expect(ACCOUNT_READ_ONLY_ACTION_MESSAGE).toBe(
      "Your account is read-only. Renew your subscription to make changes.",
    );
    expect(ACCOUNT_READ_ONLY_BANNER_MESSAGE).toBe(
      "Your subscription has ended, so your account is read-only. Renew within 30 days to keep everything. After that, your account and data are permanently deleted.",
    );
    expect(
      paymentLockUserMessage({
        planCode: BILLING_PLAN_STANDARD,
        billingStatus: "CANCELED",
      }),
    ).toBe(ACCOUNT_READ_ONLY_ACTION_MESSAGE);
  });

  it("formats cancel-scheduled message with billing date", () => {
    const periodEnd = new Date("2026-10-15T12:00:00.000Z");
    expect(accountCancelScheduledMessage(periodEnd)).toBe(
      `Your subscription ends on ${formatBillingDate(periodEnd)}. You'll keep full access until then.`,
    );
  });
});

describe("payment lock route gate", () => {
  it("runs in app layout after checkout gate", () => {
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    expect(layout).toContain("enforcePaymentLockGate");
    expect(layout.indexOf("enforcePaymentLockGate")).toBeGreaterThan(
      layout.indexOf("enforceSelfServeCheckoutGate"),
    );
    expect(layout).toContain("accountReadOnly");
  });

  it("does not redirect read-only orgs to billing-only shell", () => {
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    expect(gate).not.toContain('redirect("/settings/billing")');
    expect(lock).toContain("PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES");
    expect(lock).toContain('"/settings/billing"');
    expect(lock).toContain('"/onboarding/eula"');
    expect(lock).toContain('"/support"');
    expect(lock).toContain('"/settings/account"');
  });

  it("refuses Server Actions without redirecting views", () => {
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    const org = readFileSync(
      "src/lib/tenant/getCurrentOrganization.ts",
      "utf8",
    );
    const spend = readFileSync(
      "src/lib/billing/organization-spend.ts",
      "utf8",
    );
    // B4 finish restores the layout throw. Account settings stays path-exempt.
    // Account-menu Log Out posts to /api/account/logout, outside this layout.
    // requireOrganization → assertOrganizationWritable remains the second layer.
    expect(gate).toContain("NEXT_ACTION_HEADER");
    expect(gate).toContain("requireOrganization");
    expect(gate).toContain("throw new OrganizationReadOnlyError");
    expect(gate).toContain("/api/account/logout");
    expect(org).toContain("NEXT_ACTION_HEADER");
    expect(org).toContain("assertOrganizationWritable");
    expect(org).toContain("outside a request scope");
    expect(org).toContain("throw error");
    expect(spend).toContain("OrganizationReadOnlyError");
  });

  it("assert uses spendBlocked / read-only for writes", () => {
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");
    expect(lock).toContain("spendBlocked");
    expect(lock).toContain("isSpendBlocked");
    expect(lock).toContain("isWritesBlocked");
    expect(lock).toContain("isOrganizationReadOnly");
  });

  it("AppShell shows exact read-only banner", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("ACCOUNT_READ_ONLY_BANNER_MESSAGE");
    expect(shell).toContain("account-readonly-banner");
  });
});
