/**
 * Restored layout read-only block (account lifecycle B4 finish).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationReadOnlyError } from "@/lib/billing/account-read-only";
import { NEXT_ACTION_HEADER } from "@/lib/billing/payment-lock";

const { headerState, orgState, spendBlocked } = vi.hoisted(() => ({
  headerState: { current: new Headers() },
  orgState: {
    current: { id: "org_1" } as { id: string } | null,
  },
  spendBlocked: { current: true },
}));

vi.mock("next/headers", () => ({
  headers: async () => headerState.current,
}));

vi.mock("@/lib/tenant/getCurrentOrganization", () => ({
  getCurrentOrganization: async () => orgState.current,
}));

vi.mock("@/lib/billing/payment-lock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/payment-lock")>(
    "@/lib/billing/payment-lock",
  );
  return {
    ...actual,
    getOrganizationPaymentLockState: async () => ({
      locked: false,
      spendBlocked: spendBlocked.current,
      readOnly: spendBlocked.current,
      profile: null,
    }),
  };
});

describe("enforcePaymentLockGate", () => {
  beforeEach(() => {
    headerState.current = new Headers();
    orgState.current = { id: "org_1" };
    spendBlocked.current = true;
  });

  async function gate() {
    const { enforcePaymentLockGate } = await import(
      "@/lib/billing/payment-lock-gate"
    );
    return enforcePaymentLockGate();
  }

  it("blocks a data-changing Server Action on a non-exempt page while read-only", async () => {
    headerState.current.set("x-pathname", "/campaigns/camp_1");
    headerState.current.set(NEXT_ACTION_HEADER, "action-id");
    await expect(gate()).rejects.toBeInstanceOf(OrganizationReadOnlyError);
  });

  it("allows Account settings Server Actions while read-only", async () => {
    headerState.current.set("x-pathname", "/settings/account");
    headerState.current.set(NEXT_ACTION_HEADER, "action-id");
    await expect(gate()).resolves.toBeUndefined();
  });

  it("allows billing, support, and terms pages while read-only", async () => {
    for (const pathname of [
      "/settings/billing",
      "/support",
      "/onboarding/eula",
      "/api/billing/credits-checkout",
    ]) {
      headerState.current = new Headers();
      headerState.current.set("x-pathname", pathname);
      headerState.current.set(NEXT_ACTION_HEADER, "action-id");
      await expect(gate()).resolves.toBeUndefined();
    }
  });

  it("does not block page views that are not Server Actions", async () => {
    headerState.current.set("x-pathname", "/campaigns/camp_1");
    await expect(gate()).resolves.toBeUndefined();
  });

  it("does not block a writable account", async () => {
    spendBlocked.current = false;
    headerState.current.set("x-pathname", "/campaigns/camp_1");
    headerState.current.set(NEXT_ACTION_HEADER, "action-id");
    await expect(gate()).resolves.toBeUndefined();
  });
});
