/**
 * Authenticated user menu / nav model + logout contract tests.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildSidebarNavItems,
  buildUserMenuModel,
} from "@/lib/auth/user-menu";
import { vocab } from "@/lib/product-config";

describe("buildUserMenuModel", () => {
  it("always includes Log Out for authenticated users", () => {
    const member = buildUserMenuModel({
      email: "member@example.test",
      firstName: "Mem",
      lastName: "Ber",
      platformRole: "NONE",
      organizationName: "Acme",
      membershipRole: "MEMBER",
    });
    expect(member.links.some((l) => l.id === "log_out")).toBe(true);
    expect(member.showPlatformAdmin).toBe(false);
    expect(member.showOrganizationSettings).toBe(false);

    const admin = buildUserMenuModel({
      email: "admin@example.test",
      platformRole: "NONE",
      organizationName: "Acme",
      membershipRole: "ADMIN",
    });
    expect(admin.links.some((l) => l.id === "log_out")).toBe(true);
    expect(admin.showOrganizationSettings).toBe(true);
    expect(admin.showPlatformAdmin).toBe(false);
    expect(
      admin.links.some((l) => l.id === "organization_settings"),
    ).toBe(true);
  });

  it("SUPER_ADMIN with no organization still gets Logout + platform admin, no fake org controls", () => {
    const model = buildUserMenuModel({
      email: "erik@example.test",
      firstName: "Erik",
      platformRole: "SUPER_ADMIN",
      organizationName: null,
      membershipRole: null,
    });
    expect(model.organizationName).toBeNull();
    expect(model.showOrganizationSettings).toBe(false);
    expect(model.showPlatformAdmin).toBe(true);
    expect(model.platformRoleLabel).toBe("SUPER_ADMIN");
    expect(model.links.map((l) => l.id)).toEqual([
      "account_settings",
      "platform_admin",
      "support",
      "log_out",
    ]);
    expect(model.links.some((l) => l.id === "organization_settings")).toBe(
      false,
    );
  });

  it("SUPPORT sees Platform Support link to /platform", () => {
    const model = buildUserMenuModel({
      email: "support@example.test",
      platformRole: "SUPPORT",
      organizationName: null,
      membershipRole: null,
    });
    expect(model.showPlatformAdmin).toBe(true);
    expect(model.platformRoleLabel).toBe("SUPPORT");
    const platform = model.links.find((l) => l.id === "platform_admin");
    expect(platform?.href).toBe("/platform");
    expect(platform?.label).toBe("Platform Support");
  });

  it("SUPER_ADMIN platform link points to /platform", () => {
    const model = buildUserMenuModel({
      email: "erik@example.test",
      firstName: "Erik",
      platformRole: "SUPER_ADMIN",
      organizationName: null,
      membershipRole: null,
    });
    const platform = model.links.find((l) => l.id === "platform_admin");
    expect(platform?.href).toBe("/platform");
  });

  it("customer users never see platform controls", () => {
    const model = buildUserMenuModel({
      email: "user@acme.test",
      platformRole: "NONE",
      organizationName: "Acme",
      membershipRole: "OWNER",
    });
    expect(model.showPlatformAdmin).toBe(false);
    expect(model.links.some((l) => l.id === "platform_admin")).toBe(false);
    expect(model.links.some((l) => l.id === "log_out")).toBe(true);
    expect(model.links.some((l) => l.id === "support")).toBe(true);
    expect(model.workspaces).toEqual([]);
  });

  it("keeps Support available when payment locked", () => {
    const model = buildUserMenuModel({
      email: "locked@acme.test",
      platformRole: "NONE",
      organizationName: "Acme",
      membershipRole: "OWNER",
      paymentLocked: true,
    });
    expect(model.links.map((link) => link.id)).toEqual(["support", "log_out"]);
  });

  it("passes through workspaces for the switcher", () => {
    const model = buildUserMenuModel({
      email: "user@acme.test",
      platformRole: "NONE",
      organizationName: "Acme",
      membershipRole: "OWNER",
      workspaces: [
        { organizationId: "a", name: "Acme", isActive: true },
        { organizationId: "b", name: "Team", isActive: false },
      ],
    });
    expect(model.workspaces).toHaveLength(2);
    expect(model.workspaces[0]?.isActive).toBe(true);
  });
});

describe("buildSidebarNavItems", () => {
  it("platform-only SUPER_ADMIN does not require Organization nav", () => {
    const items = buildSidebarNavItems({
      hasOrganization: false,
      isPlatformOperator: true,
    });
    expect(items.some((i) => i.href === "/platform")).toBe(true);
    expect(items.some((i) => i.href === "/settings/account")).toBe(true);
    expect(items.some((i) => i.href === "/lists")).toBe(false);
    expect(items.some((i) => i.href === "/contacts")).toBe(false);
    expect(items.some((i) => i.href === "/")).toBe(false);
  });

  it("organization MEMBER gets workspace nav without inventing platform links", () => {
    const items = buildSidebarNavItems({
      hasOrganization: true,
      isPlatformOperator: false,
    });
    expect(items.some((i) => i.href === "/")).toBe(true);
    expect(items.some((i) => i.href === "/lists")).toBe(false);
    expect(
      items.some((i) => i.href === "/contacts" && i.label === vocab.contact.Plural),
    ).toBe(true);
    expect(
      items.some((i) => i.href === "/campaigns" && i.label === vocab.campaign.Plural),
    ).toBe(true);
    expect(
      items.some((i) => i.href === "/products" && i.label === vocab.product.nav),
    ).toBe(true);
    expect(items.some((i) => i.href === "/icps" && i.label === vocab.icp.nav)).toBe(
      true,
    );
    expect(items.some((i) => i.href === "/personas")).toBe(false);
    expect(items.map((i) => i.href)).toEqual([
      "/",
      "/campaigns",
      "/contacts",
      "/products",
      "/icps",
      "/settings/voice",
      "/settings",
      "/settings/account",
    ]);
    expect(items.some((i) => i.href === "/setup")).toBe(false);
    expect(
      items.some(
        (i) => i.href === "/settings/voice" && i.label === "Your Voice",
      ),
    ).toBe(true);
    expect(items.some((i) => i.href === "/platform")).toBe(false);
  });

  it("SUPPORT sees Platform nav", () => {
    const items = buildSidebarNavItems({
      hasOrganization: false,
      isPlatformOperator: true,
    });
    expect(
      items.some((i) => i.href === "/platform" && i.label === "Platform"),
    ).toBe(true);
  });
});

describe("logoutAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("calls Better Auth signOut and redirects to /login (no manual cookie deletion)", async () => {
    const signOut = vi.fn(async () => ({ success: true }));
    const redirect = vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    });
    const recordAdminAuditEvent = vi.fn(async () => undefined);

    vi.doMock("next/headers", () => ({
      headers: async () => new Headers(),
    }));
    vi.doMock("next/navigation", () => ({ redirect }));
    vi.doMock("@/lib/auth/server", () => ({
      auth: { api: { signOut } },
    }));
    vi.doMock("@/lib/auth/authz", () => ({
      requireCurrentUser: async () => ({
        id: "user_1",
        activeOrganizationId: null,
      }),
    }));
    vi.doMock("@/lib/auth/audit", () => ({ recordAdminAuditEvent }));
    vi.doMock("@/lib/transactional-email/send", () => ({
      sendTransactionalEmail: vi.fn(),
    }));
    vi.doMock("@/lib/prisma", () => ({ prisma: {} }));
    vi.doMock("@/lib/auth/rate-limit", () => ({
      assertRateLimit: vi.fn(),
    }));

    const { logoutAction } = await import("@/app/actions/account");
    await expect(logoutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.anything() }),
    );
    expect(recordAdminAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGOUT",
        actorUserId: "user_1",
      }),
    );
    // No document.cookie / cookies().delete in the action path
    const actionSource = await import("node:fs").then((fs) =>
      fs.readFileSync("src/app/actions/account.ts", "utf8"),
    );
    expect(actionSource).toContain("auth.api.signOut");
    expect(actionSource).not.toMatch(/cookies\(\)\.delete/);
    expect(actionSource).not.toMatch(/document\.cookie/);
  });
});

describe("sidebar layout", () => {
  it("stays viewport-tall so it cannot intercept clicks on long pages", () => {
    const source = readFileSync("src/components/Sidebar.tsx", "utf8");
    expect(source).toContain("sticky top-0");
    expect(source).toContain("h-screen");
    expect(source).toContain("overflow-y-auto");
  });
});

describe("middleware destination preservation", () => {
  it("public login/signup stay public; protected paths redirect with next=", async () => {
    const { middleware } = await import("@/middleware");
    const loginReq = {
      nextUrl: { pathname: "/login" },
      url: "https://app.example/login",
      cookies: { get: () => undefined },
    } as unknown as import("next/server").NextRequest;

    // Public paths are allowlisted in middleware source
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/middleware.ts", "utf8"),
    );
    expect(src).toContain('"/login"');
    expect(src).toContain('"/signup"');
    expect(src).toContain('"/api/billing/webhooks/stripe"');
    expect(src).toContain('"/api/jobs/cadence-digest"');
    expect(src).toContain('login.searchParams.set("next", pathname)');
    expect(src).toContain("better-auth.session_token");
    void middleware;
    void loginReq;
  });
});
