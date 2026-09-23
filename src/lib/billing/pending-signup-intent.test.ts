import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPendingSignupIntent,
  parsePendingSignupIntent,
} from "@/lib/billing/pending-signup-intent";

const cookies = vi.fn();

vi.mock("next/headers", () => ({
  cookies: (...args: unknown[]) => cookies(...args),
}));

describe("pending signup intent", () => {
  it("parses Standard with quantity 1", () => {
    expect(
      parsePendingSignupIntent({
        planCode: "STANDARD",
        seatQuantity: 5,
        companyName: "Acme",
      }),
    ).toEqual({
      planCode: "STANDARD",
      seatQuantity: 1,
      companyName: "Acme",
    });
  });

  it("clamps Team seats to 2–10", () => {
    expect(
      parsePendingSignupIntent({ planCode: "TEAM", seatQuantity: 1 }),
    ).toMatchObject({ planCode: "TEAM", seatQuantity: 2 });
    expect(
      parsePendingSignupIntent({ planCode: "TEAM", seatQuantity: 99 }),
    ).toMatchObject({ planCode: "TEAM", seatQuantity: 10 });
  });

  it("rejects Enterprise and unknown plans", () => {
    expect(parsePendingSignupIntent({ planCode: "ENTERPRISE" })).toBeNull();
    expect(buildPendingSignupIntent({ planCode: "FREE" })).toBeNull();
  });
});

describe("readPendingSignupIntent outside a request", () => {
  const previousSkip = process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP;

  afterEach(async () => {
    cookies.mockReset();
    if (previousSkip == null) {
      delete process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP;
    } else {
      process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP = previousSkip;
    }
    const { endPlatformSuperAdminProvisioning } = await import(
      "@/lib/auth/platform-provision-flag"
    );
    endPlatformSuperAdminProvisioning();
  });

  it("does not call cookies() when ALLOW_PENDING_SIGNUP_INTENT_SKIP=1", async () => {
    process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP = "1";
    cookies.mockRejectedValue(new Error("cookies was called outside a request scope"));
    const { readPendingSignupIntent } = await import(
      "@/lib/billing/pending-signup-intent-cookie"
    );
    await expect(readPendingSignupIntent()).resolves.toBeNull();
    expect(cookies).not.toHaveBeenCalled();
  });

  it("does not call cookies() during platform SUPER_ADMIN provisioning", async () => {
    delete process.env.ALLOW_PENDING_SIGNUP_INTENT_SKIP;
    const { beginPlatformSuperAdminProvisioning } = await import(
      "@/lib/auth/platform-provision-flag"
    );
    beginPlatformSuperAdminProvisioning();
    cookies.mockRejectedValue(new Error("cookies was called outside a request scope"));
    const { readPendingSignupIntent } = await import(
      "@/lib/billing/pending-signup-intent-cookie"
    );
    await expect(readPendingSignupIntent()).resolves.toBeNull();
    expect(cookies).not.toHaveBeenCalled();
  });
});
