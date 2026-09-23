import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPaymentLockPathExempt,
  PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES,
} from "@/lib/billing/payment-lock";
import {
  BASELINE_TEMPLATES,
  TEMPLATE_REQUIRED_VARIABLES,
  TEMPLATE_VARIABLE_ALLOWLIST,
} from "@/lib/transactional-email/templates";

const {
  assertRateLimit,
  createSupportTicket,
  sendTransactionalEmail,
} = vi.hoisted(() => ({
  assertRateLimit: vi.fn(async () => undefined),
  createSupportTicket: vi.fn(async () => ({
    id: "ticket_1",
    organizationId: "org_1",
    organizationName: "Canceled Workspace",
  })),
  sendTransactionalEmail: vi.fn(async () => {
    throw new Error("provider unavailable");
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Support test browser" }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCurrentUser: async () => ({
    id: "user_1",
    email: "user@example.test",
    firstName: "Test",
    lastName: "User",
    name: null,
  }),
  resolveActiveOrganization: async () => ({
    organization: {
      id: "org_1",
      name: "Canceled Workspace",
      status: "CANCELLED",
    },
    membership: { role: "OWNER" },
  }),
}));
vi.mock("@/lib/auth/authz", () => ({
  requirePlatformOperator: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  RateLimitError: class RateLimitError extends Error {
    readonly code = "RATE_LIMITED";
    constructor(message: string) {
      super(message);
      this.name = "RateLimitError";
    }
  },
  assertRateLimit,
}));
vi.mock("@/lib/auth/audit", () => ({
  recordAdminAuditEvent: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationBillingProfile: {
      findUnique: async () => ({
        planCode: "STANDARD",
        billingStatus: "CANCELED",
      }),
    },
    supportTicket: { create: createSupportTicket },
  },
}));
vi.mock("@/lib/transactional-email/send", () => ({
  sendTransactionalEmail,
}));

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.SUPPORT_TICKET_NOTIFICATION_EMAIL;
  delete process.env.APP_URL;
});

describe("support ticket contract", () => {
  it("keeps support reachable through payment and checkout locks", () => {
    expect(PAYMENT_LOCK_ROUTE_EXEMPT_PREFIXES).toContain("/support");
    expect(isPaymentLockPathExempt("/support")).toBe(true);
    expect(isPaymentLockPathExempt("/support/anything")).toBe(true);

    const checkoutGate = readFileSync(
      "src/lib/billing/checkout-gate.ts",
      "utf8",
    );
    const eulaGate = readFileSync("src/lib/legal/eula-gate.ts", "utf8");
    expect(checkoutGate).toContain('"/support"');
    expect(eulaGate).toContain('pathname === "/support"');
  });

  it("keeps the notification recipient in private configuration", () => {
    const action = readFileSync("src/app/actions/support.ts", "utf8");
    const config = readFileSync("src/lib/support/config.ts", "utf8");
    const form = readFileSync("src/components/SupportTicketForm.tsx", "utf8");

    expect(config).toContain("SUPPORT_TICKET_NOTIFICATION_EMAIL");
    expect(action).toContain("supportTicketNotificationEmail()");
    expect(action).not.toMatch(/@[a-z0-9.-]+\.(com|io)/);
    expect(form).not.toMatch(/mailto:/i);
  });

  it("defines a minimal three-state schema with private notes", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("enum SupportTicketStatus");
    expect(schema).toMatch(
      /enum SupportTicketStatus\s*\{\s*OPEN\s*IN_PROGRESS\s*CLOSED\s*\}/,
    );
    expect(schema).toContain("model SupportTicketNote");
    expect(schema).toContain("supportTicket SupportTicket");
  });

  it("uses the existing transactional template path", () => {
    expect(TEMPLATE_VARIABLE_ALLOWLIST.SUPPORT_TICKET_CREATED).toEqual(
      expect.arrayContaining(["ticketSubject", "workspaceName", "ticketUrl"]),
    );
    expect(TEMPLATE_REQUIRED_VARIABLES.SUPPORT_TICKET_CREATED).toEqual([
      "ticketSubject",
      "workspaceName",
      "ticketUrl",
    ]);
    expect(
      BASELINE_TEMPLATES.SUPPORT_TICKET_CREATED.textTemplate,
    ).not.toContain("supportEmail");
  });

  it("exposes the platform queue in persistent console navigation", () => {
    const nav = readFileSync("src/components/PlatformConsoleNav.tsx", "utf8");
    const audit = readFileSync("src/lib/platform/route-audit.ts", "utf8");
    expect(nav).toContain('href: "/platform/support"');
    expect(audit).toContain('"/platform/support/[id]"');
  });
});

describe("createSupportTicketAction", () => {
  it("accepts a canceled organization and preserves the ticket if email fails", async () => {
    process.env.SUPPORT_TICKET_NOTIFICATION_EMAIL = "ops@example.test";
    process.env.APP_URL = "https://app.example.test";

    const { createSupportTicketAction } = await import(
      "@/app/actions/support"
    );
    const formData = new FormData();
    formData.set("subject", "Billing is locked");
    formData.set("description", "I need help restoring this workspace.");
    formData.set("sourcePath", "/settings/billing?secret=ignored");

    const result = await createSupportTicketAction(null, formData);

    expect(result).toEqual({
      ok: true,
      message: "Your support request was received. Someone will follow up.",
    });
    expect(createSupportTicket).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        organizationName: "Canceled Workspace",
        billingStatus: "CANCELED",
        sourcePath: "/settings/billing",
      }),
      select: {
        id: true,
        organizationId: true,
        organizationName: true,
      },
    });
    expect(assertRateLimit).toHaveBeenCalledTimes(2);
    expect(sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ops@example.test",
        idempotencyKey: "support-ticket-created:ticket_1",
        variables: expect.objectContaining({
          ticketUrl:
            "https://app.example.test/platform/support/ticket_1",
        }),
      }),
    );
  });
});
