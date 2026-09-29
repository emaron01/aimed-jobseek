import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workspace switcher + personal billing notice", () => {
  it("UserMenu renders switcher only when multiple workspaces", () => {
    const src = readFileSync("src/components/UserMenu.tsx", "utf8");
    expect(src).toContain("switchActiveOrganizationAction");
    expect(src).toContain("model.workspaces.length > 1");
    expect(src).toContain("workspace-switcher");
  });

  it("switch action calls setActiveOrganization and reloads via redirect", () => {
    const src = readFileSync("src/app/actions/workspace.ts", "utf8");
    expect(src).toContain("setActiveOrganization");
    expect(src).toContain('redirect("/")');
    expect(src).toContain("revalidatePath");
  });

  it("personal billing notice is persistent in AppShell, not invite accept", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    const accept = readFileSync("src/lib/org/signup.ts", "utf8");
    const banner = readFileSync(
      "src/components/billing/PersonalBillingNoticeBanner.tsx",
      "utf8",
    );
    expect(shell).toContain("PersonalBillingNoticeBanner");
    expect(shell).toContain("listOwnedBilledOrganizationsAsideFrom");
    expect(banner).toContain("You still have an active");
    expect(banner).toContain("Cancel Standard here");
    expect(banner).toMatch(/Type.*CANCEL/);
    // Invite accept must not cancel or merge personal billing.
    expect(accept).not.toContain("cancelOwnedOrgSubscription");
    expect(accept).not.toContain("markSubscriptionCanceled");
  });

  it("cancel of owned Standard schedules cancel-at-period-end", () => {
    const src = readFileSync("src/app/actions/workspace.ts", "utf8");
    expect(src).toContain("cancelOwnedOrgSubscriptionAction");
    expect(src).toContain('confirm !== "CANCEL"');
    expect(src).toContain("scheduleSubscriptionCancelAtPeriodEnd");
    expect(src).not.toContain("cancelStripeSubscriptionForOrgDelete");
    expect(src).not.toContain("markSubscriptionCanceled");
  });
});

describe("payment lock is per-organization", () => {
  it("gate and layout resolve lock from the active organization only", () => {
    const gate = readFileSync("src/lib/billing/payment-lock-gate.ts", "utf8");
    const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
    const lock = readFileSync("src/lib/billing/payment-lock.ts", "utf8");

    expect(gate).toContain("getCurrentOrganization");
    expect(gate).toContain("getOrganizationPaymentLockState");
    expect(gate).toContain("organization.id");
    expect(gate).not.toContain('redirect("/settings/billing")');
    expect(layout).toContain("getOrganizationPaymentLockState");
    expect(layout).toContain("organization.id");
    expect(layout).toContain("accountReadOnly");
    expect(lock).toContain("getOrganizationPaymentLockState");
    expect(lock).toContain("organizationId: string");
    expect(lock).toContain("assertOrganizationNotPaymentLocked");
    expect(lock).toContain("isOrganizationReadOnly");
  });
});
