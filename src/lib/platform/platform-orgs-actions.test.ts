/**
 * Platform org action gates. Mocks stay hoisted so the action module is
 * imported once at file load — not inside each 5s `it()` under parallel load.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/authz";

const mocks = vi.hoisted(() => ({
  requirePlatformSuperAdmin: vi.fn(),
  suspendOrganization: vi.fn(),
  deleteOrganization: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/authz")>();
  return {
    ...actual,
    requirePlatformSuperAdmin: mocks.requirePlatformSuperAdmin,
  };
});

vi.mock("@/lib/platform/orgs", () => ({
  grantOrganizationCredit: vi.fn(),
  grantCompanyResearchCreditsAsPlatform: vi.fn(),
  suspendOrganization: mocks.suspendOrganization,
  unsuspendOrganization: vi.fn(),
  deleteOrganization: mocks.deleteOrganization,
  convertOrganizationToComped: vi.fn(),
  updateOrganizationUsagePolicyAsPlatform: vi.fn(),
  updateOrganizationResearchPolicyAsPlatform: vi.fn(),
  createPlatformOrganization: vi.fn(),
}));

vi.mock("@/lib/org/signup", () => ({
  changeOrganizationMemberRole: vi.fn(),
  createOrganizationInvitationAsPlatform: vi.fn(),
  removeOrganizationMember: vi.fn(),
  revokeOrganizationInvitationAsPlatform: vi.fn(),
}));

vi.mock("@/lib/platform/purge-contact-outbound", () => ({
  purgeOrganizationContactOutboundData: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import {
  deleteOrganizationAction,
  suspendOrganizationAction,
} from "@/app/actions/platform-orgs";

describe("platform-orgs actions gate mutations to SUPER_ADMIN", () => {
  beforeEach(() => {
    mocks.requirePlatformSuperAdmin.mockReset();
    mocks.suspendOrganization.mockReset();
    mocks.deleteOrganization.mockReset();
    mocks.redirect.mockReset();
  });

  it("SUPPORT cannot suspend; SUPER_ADMIN can", async () => {
    mocks.requirePlatformSuperAdmin.mockRejectedValueOnce(
      new AuthorizationError("Platform super admin required."),
    );
    const fd = new FormData();
    fd.set("organizationId", "org_1");
    fd.set("reason", "abuse");
    const result = await suspendOrganizationAction(null, fd);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Platform super admin required");
    expect(mocks.suspendOrganization).not.toHaveBeenCalled();

    mocks.requirePlatformSuperAdmin.mockResolvedValueOnce({
      id: "sa_1",
      platformRole: "SUPER_ADMIN",
    });
    mocks.suspendOrganization.mockResolvedValueOnce(undefined);
    const ok = await suspendOrganizationAction(null, fd);
    expect(ok.ok).toBe(true);
    expect(mocks.suspendOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "sa_1",
        reason: "abuse",
      }),
    );
  });

  it("SUPPORT cannot delete org; SUPER_ADMIN can with exact confirmation", async () => {
    mocks.requirePlatformSuperAdmin.mockRejectedValueOnce(
      new AuthorizationError("Platform super admin required."),
    );
    const deniedFd = new FormData();
    deniedFd.set("organizationId", "org_1");
    deniedFd.set("confirmation", "Delete");
    const denied = await deleteOrganizationAction(null, deniedFd);
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain("Platform super admin required");
    expect(mocks.deleteOrganization).not.toHaveBeenCalled();

    mocks.requirePlatformSuperAdmin.mockResolvedValue({
      id: "sa_1",
      platformRole: "SUPER_ADMIN",
    });
    mocks.deleteOrganization.mockResolvedValue({
      id: "org_1",
      name: "Acme",
    });
    mocks.redirect.mockImplementation(() => {
      const err = new Error("NEXT_REDIRECT");
      (err as { digest?: string }).digest = "NEXT_REDIRECT;/platform/orgs";
      throw err;
    });

    const wrongConfirm = new FormData();
    wrongConfirm.set("organizationId", "org_1");
    wrongConfirm.set("confirmation", "delete");
    const rejected = await deleteOrganizationAction(null, wrongConfirm);
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toContain("Delete");
    expect(mocks.deleteOrganization).not.toHaveBeenCalled();

    const okFd = new FormData();
    okFd.set("organizationId", "org_1");
    okFd.set("confirmation", "Delete");
    await expect(deleteOrganizationAction(null, okFd)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(mocks.deleteOrganization).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorUserId: "sa_1",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/platform/orgs");
  });
});
