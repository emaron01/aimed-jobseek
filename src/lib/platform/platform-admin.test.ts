/**
 * Phase A platform admin console seam tests.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canMutatePlatform,
  isPlatformOperator,
  canEditTransactionalTemplates,
} from "@/lib/auth/authz";

describe("platform role gates", () => {
  it("SUPPORT is operator but cannot mutate or edit templates", () => {
    expect(isPlatformOperator("SUPPORT")).toBe(true);
    expect(canMutatePlatform("SUPPORT")).toBe(false);
    expect(canEditTransactionalTemplates("SUPPORT")).toBe(false);
  });

  it("SUPER_ADMIN can mutate platform and edit templates", () => {
    expect(isPlatformOperator("SUPER_ADMIN")).toBe(true);
    expect(canMutatePlatform("SUPER_ADMIN")).toBe(true);
    expect(canEditTransactionalTemplates("SUPER_ADMIN")).toBe(true);
  });

  it("NONE is not a platform operator", () => {
    expect(isPlatformOperator("NONE")).toBe(false);
    expect(canMutatePlatform("NONE")).toBe(false);
  });
});

describe("platform org delete purges orphaned identities", () => {
  it("deleteOrganization cancels Stripe then purges orphaned identities", () => {
    const src = readFileSync(resolve("src/lib/platform/orgs.ts"), "utf8");
    expect(src).toContain("cancelStripeSubscriptionForOrgDelete");
    expect(src).toContain("subscriptions.cancel");
    expect(src).toContain("resource_missing");
    expect(src).toContain("purgeOrphanedTenantUsersAfterOrgDelete");
    expect(src).toContain("PLATFORM_ORGANIZATION_DELETED");
    const purge = readFileSync(
      resolve("src/lib/auth/purge-identity.ts"),
      "utf8",
    );
    expect(purge).toContain("authUser.delete");
    expect(purge).toContain("authSession.deleteMany");
    expect(purge).toContain('platformRole !== "NONE"');
    const panel = readFileSync(
      resolve("src/components/platform/DeleteOrganizationPanel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/Stripe subscription/i);
  });

  it("provision repairs missing workspace instead of throwing", () => {
    const src = readFileSync(
      resolve("src/lib/auth/provision-service.ts"),
      "utf8",
    );
    expect(src).toContain("repairedMissingWorkspace");
    expect(src).not.toContain(
      "User exists without organization membership; contact support.",
    );
  });

  it("session create and resolveActiveOrganization ensure workspace", () => {
    const auth = readFileSync(resolve("src/lib/auth/better-auth.ts"), "utf8");
    expect(auth).toContain("session:");
    expect(auth).toMatch(/session:\s*\{[\s\S]*create:\s*\{[\s\S]*provisionIndividualWorkspace/);
    const session = readFileSync(resolve("src/lib/auth/session.ts"), "utf8");
    expect(session).toContain("provisionIndividualWorkspace");
    expect(session).toContain('platformRole === "NONE"');
  });
});

describe("invite accept page", () => {
  it("exists and wires accept through AcceptInviteClient + Server Action", () => {
    const src = readFileSync(
      resolve("src/app/(auth)/invite/accept/page.tsx"),
      "utf8",
    );
    expect(src).toContain("AcceptInviteClient");
    expect(src).toContain("/invite/accept");
    const client = readFileSync(
      resolve("src/app/(auth)/invite/accept/AcceptInviteClient.tsx"),
      "utf8",
    );
    expect(client).toContain("acceptInviteAction");
    const action = readFileSync(resolve("src/app/actions/invite.ts"), "utf8");
    expect(action).toContain("acceptOrganizationInvitation");
    expect(action).toContain("rawToken");
  });
});

describe("billing profile schema strip", () => {
  it("OrganizationBillingProfile keeps ops email + billing state, no tax/address PII", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    const start = schema.indexOf("model OrganizationBillingProfile");
    expect(start).toBeGreaterThan(-1);
    const end = schema.indexOf("\nmodel ", start + 1);
    const block = schema.slice(start, end > 0 ? end : undefined);
    expect(block).toContain("billingEmail");
    expect(block).toContain("planCode");
    expect(block).toContain("billingStatus");
    expect(block).toContain("stripeCustomerId");
    expect(block).not.toContain("taxId");
    expect(block).not.toContain("addressLine1");
    expect(block).not.toContain("companyLegalName");
    expect(block).not.toContain("countryCode");
  });
});

describe("platform console navigation and account creation", () => {
  it("layout mounts persistent platform nav", () => {
    const layout = readFileSync(resolve("src/app/platform/layout.tsx"), "utf8");
    expect(layout).toContain("PlatformConsoleNav");
    expect(layout).toContain("requirePlatformOperator");
  });

  it("home links every admin area and audits routes", () => {
    const home = readFileSync(resolve("src/app/platform/page.tsx"), "utf8");
    expect(home).toContain("/platform/orgs");
    expect(home).toContain("/platform/orgs/new");
    expect(home).toContain("/platform/costs");
    expect(home).toContain("/platform/ai");
    expect(home).toContain("/platform/email-templates");
    expect(home).toContain("/platform/billing");
    expect(home).toContain("/platform/catalog");
    expect(home).toContain("/platform/eula");
    expect(home).toContain("PLATFORM_ROUTE_AUDIT");
  });

  it("platform console hosts AI configuration; workspace Settings does not", () => {
    const settings = readFileSync(
      resolve("src/app/(app)/settings/page.tsx"),
      "utf8",
    );
    const platformAi = readFileSync(
      resolve("src/app/platform/ai/page.tsx"),
      "utf8",
    );
    const nav = readFileSync(
      resolve("src/components/PlatformConsoleNav.tsx"),
      "utf8",
    );
    expect(settings).not.toContain("AiRoleStatusList");
    expect(settings).not.toContain("listAiRoleStatuses");
    expect(platformAi).toContain("AiRoleStatusList");
    expect(platformAi).toContain("listAiRoleStatuses");
    expect(nav).toContain("/platform/ai");
  });

  it("create account page invites first OWNER", () => {
    const page = readFileSync(
      resolve("src/app/platform/orgs/new/page.tsx"),
      "utf8",
    );
    expect(page).toContain("createPlatformOrganizationAction");
    expect(page).toContain("INDIVIDUAL");
    expect(page).toContain("ENTERPRISE");
    expect(page).toContain("ownerEmail");
  });

  it("schema has account type and billing status enums", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("enum OrganizationAccountType");
    expect(schema).toContain("enum BillingStatus");
    expect(schema).toContain("PLATFORM_ORGANIZATION_CREATED");
    expect(schema).toContain("ORGANIZATION_MEMBER_REMOVED");
  });

  it("org settings billing page is OWNER/ADMIN gated", () => {
    const page = readFileSync(
      resolve("src/app/(app)/settings/billing/page.tsx"),
      "utf8",
    );
    expect(page).toContain("getMembershipForCurrentUser");
    expect(page).toContain("canManageOrganizationPolicy");
    expect(page).toContain("billing-stripe-hook");
    expect(page).toMatch(/account is comped/i);
  });

  it("org detail includes member invite/remove and cost", () => {
    const detailPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/page.tsx"),
      "utf8",
    );
    expect(detailPage).toContain("platformInviteUserAction");
    expect(detailPage).toContain("platformRemoveMemberAction");
    expect(detailPage).toContain("computeCostReport");
    expect(detailPage).toContain("Scoped customer view");
  });
});

describe("usage alert ledger uniqueness seam", () => {
  it("schema defines unique org+resource+period+threshold", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model UsageAlertLedger");
    expect(schema).toContain(
      "@@unique([organizationId, resource, periodKey, thresholdPercent])",
    );
    expect(schema).toContain("USAGE_LIMIT_WARNING");
    expect(schema).toContain("ACTIVE_COMPANY");
  });

  it("quota path calls usage alert helper after consume", () => {
    const quota = readFileSync(resolve("src/lib/usage/quota-service.ts"), "utf8");
    expect(quota).toContain("maybeFireUsageAlert");
    expect(quota).toContain("ACTIVE_COMPANY");
    expect(quota).toContain("EMAIL_GENERATION");
  });
});

describe("provision creates OWNER", () => {
  it("provision-service writes OWNER for new individual workspaces", () => {
    const src = readFileSync(
      resolve("src/lib/auth/provision-service.ts"),
      "utf8",
    );
    expect(src).toMatch(/role:\s*"OWNER"/);
    expect(src).toContain('membershipRole: "OWNER"');
    expect(src).not.toContain("companyLegalName");
  });
});

describe("platform org detail and scoped view", () => {
  it("detail shows lists, setup completeness, credits, and health", () => {
    const detailPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/page.tsx"),
      "utf8",
    );
    expect(detailPage).toContain("{vocab.list.Plural} (");
    expect(detailPage).toContain("Setup completeness");
    expect(detailPage).toContain("Credit grants");
    expect(detailPage).toContain("Health (failure rates)");
    expect(detailPage).toContain("contactLists");
    expect(detailPage).toContain("DeleteOrganizationPanel");
  });

  it("scoped view is read-only and audited, not impersonation", () => {
    const viewPage = readFileSync(
      resolve("src/app/platform/orgs/[id]/view/page.tsx"),
      "utf8",
    );
    expect(viewPage).toContain("Scoped read-only view");
    expect(viewPage).toContain("not impersonation");
    expect(viewPage).toContain("recordPlatformOrgView");
    expect(viewPage).not.toContain("suspendOrganizationAction");
    expect(viewPage).not.toContain("grantOrganizationCreditAction");
    expect(viewPage).not.toContain("DeleteOrganizationPanel");
  });
});

describe("phase B cost reporting seams", () => {
  it("platform home is costs-aware (not a bare redirect)", () => {
    const home = readFileSync(resolve("src/app/platform/page.tsx"), "utf8");
    expect(home).not.toMatch(/redirect\(["']\/platform\/orgs["']\)/);
    expect(home).toContain("Costs");
    expect(home).toContain("getLatestSpendDrift");
    expect(home).toContain("computeCostReport");
  });

  it("costs page covers company cost, ratio, projections, rates, reconciliation", () => {
    const page = readFileSync(resolve("src/app/platform/costs/page.tsx"), "utf8");
    expect(page).toContain("Cost per company researched");
    expect(page).toContain("{vocab.contact.Plural} per company");
    expect(page).toContain("Projected monthly cost");
    expect(page).toContain("Spend by operation");
    expect(page).toContain("Spend per application");
    expect(page).toContain("ensureAiModelRatesSeeded");
    expect(page).toContain("upsertAiModelRateAction");
    expect(page).toContain("recordSpendReconciliationAction");
  });

  it("schema has AiModelRate and ProviderSpendReconciliation", () => {
    const schema = readFileSync(resolve("prisma/schema.prisma"), "utf8");
    expect(schema).toContain("model AiModelRate");
    expect(schema).toContain("model ProviderSpendReconciliation");
    expect(schema).toContain("AI_MODEL_RATE_CHANGED");
    expect(schema).toContain("PROVIDER_SPEND_RECONCILED");
  });
});

describe("invite accept sets active org and retires empty personal workspace", () => {
  it("acceptOrganizationInvitation updates activeOrganizationId and calls retire helper", () => {
    const src = readFileSync(resolve("src/lib/org/signup.ts"), "utf8");
    expect(src).toContain("export async function retireEmptyPersonalWorkspace");
    expect(src).toContain("activeOrganizationId: invitation.organizationId");
    expect(src).toContain(
      "retireEmptyPersonalWorkspace(user.id, invitation.organizationId)",
    );
    expect(src).toContain("keepOrganizationId");
  });

  it("logged-out invite accept page leads with Create account and preserves token", () => {
    const page = readFileSync(
      resolve("src/app/(auth)/invite/accept/page.tsx"),
      "utf8",
    );
    expect(page).toContain("Create account");
    expect(page).toContain("Already have an account? Sign in");
    expect(page).toContain("Create a password and you will join");
    expect(page).toContain("next=${encodeURIComponent(next)}");
    expect(page).not.toMatch(/\bcookies\s*\(/);
    expect(page).not.toContain("pending_invite_token");
    expect(page).toContain("AcceptInviteClient");
    const action = readFileSync(resolve("src/app/actions/invite.ts"), "utf8");
    expect(action).toContain("acceptInviteAction");
    expect(action).toContain("acceptOrganizationInvitation");
    const signup = readFileSync(
      resolve("src/components/auth/SignupForm.tsx"),
      "utf8",
    );
    expect(signup).toContain("inviteMode");
    expect(signup).toContain("readOnly={lockedEmail}");
    expect(signup).toContain("Create a password and you will join");
  });
});
