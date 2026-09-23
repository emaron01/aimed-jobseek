import { describe, expect, it } from "vitest";
import {
  FUTURE_PREMIUM_SEAT_MAX,
  FUTURE_PREMIUM_SEAT_MIN,
  SEAT_LIMIT_REACHED_MESSAGE,
  individualOrgAdminInviteBlockMessage,
  orgAdminInviteDenialReason,
  orgAdminInvitesAllowed,
} from "@/lib/org/seats";

describe("org seat / invite policy", () => {
  it("blocks org-admin invites on INDIVIDUAL Standard", () => {
    expect(
      orgAdminInvitesAllowed({
        accountType: "INDIVIDUAL",
        planCode: "STANDARD",
      }),
    ).toBe(false);
    expect(
      orgAdminInviteDenialReason({
        accountType: "INDIVIDUAL",
        planCode: "STANDARD",
      }),
    ).toContain("limited to one user");
    expect(individualOrgAdminInviteBlockMessage()).toContain("Team");
    expect(individualOrgAdminInviteBlockMessage()).toContain(
      process.env.SUPPORT_EMAIL,
    );
  });

  it("keeps comped access subject to the product seat policy", () => {
    expect(
      orgAdminInvitesAllowed({
        accountType: "INDIVIDUAL",
        planCode: "COMPED",
      }),
    ).toBe(false);
    expect(
      orgAdminInvitesAllowed({
        accountType: "ENTERPRISE",
        planCode: "ENTERPRISE",
        seatQuantity: 5,
        maxSeats: 10,
        usedSeats: 2,
      }),
    ).toBe(true);
    expect(
      orgAdminInviteDenialReason({
        accountType: "ENTERPRISE",
        planCode: "ENTERPRISE",
        seatQuantity: 5,
        maxSeats: 10,
        usedSeats: 5,
      }),
    ).toBe(SEAT_LIMIT_REACHED_MESSAGE);
  });

  it("allows seat-capacity ENTERPRISE/TEAM", () => {
    expect(
      orgAdminInviteDenialReason({
        accountType: "INDIVIDUAL",
        planCode: "TEAM",
        seatQuantity: 3,
        maxSeats: 10,
        usedSeats: 1,
      }),
    ).toBeNull();
  });

  it("blocks TEAM/ENTERPRISE invites at seat capacity", () => {
    expect(
      orgAdminInviteDenialReason({
        accountType: "INDIVIDUAL",
        planCode: "TEAM",
        seatQuantity: 3,
        maxSeats: 10,
        usedSeats: 3,
      }),
    ).toBe(SEAT_LIMIT_REACHED_MESSAGE);
  });

  it("keeps Team seat bounds at 2–10", () => {
    expect(FUTURE_PREMIUM_SEAT_MIN).toBe(2);
    expect(FUTURE_PREMIUM_SEAT_MAX).toBe(10);
  });

  it("gates org-admin createOrganizationInvitation and leaves platform path open", async () => {
    const { readFileSync } = await import("node:fs");
    const signup = readFileSync("src/lib/org/signup.ts", "utf8");
    expect(signup).toContain("orgAdminInviteDenialReason");
    expect(signup).toContain("createOrganizationInvitationAsPlatform");
    const platformFn = signup.slice(
      signup.indexOf("createOrganizationInvitationAsPlatform"),
      signup.indexOf("async function issueOrganizationInvitation"),
    );
    expect(platformFn).not.toContain("orgAdminInviteDenialReason");
  });
});
