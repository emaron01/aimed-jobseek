import { vocab } from "@/lib/product-config";

export type SmokeExpectation = {
  /** Substring(s); any match in the final HTML body passes. */
  mustInclude: string | string[];
  /** When true, request without session cookie (public page). */
  public?: boolean;
  /** Expected HTTP status. Defaults to 200. */
  status?: number;
};

const NOT_FOUND: SmokeExpectation = {
  mustInclude: "This page could not be found",
  status: 404,
};

const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/signup/plan",
  "/verify-email",
  "/post-verify",
  "/forgot-password",
  "/reset-password",
  "/invite",
] as const;

export function isPublicSmokeRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const ROUTE_EXPECTATIONS: Record<string, SmokeExpectation> = {
  "/login": { mustInclude: "Sign in", public: true },
  "/signup": {
    mustInclude: ["Create account", "Choose your plan"],
    public: true,
  },
  "/signup/plan": { mustInclude: "Choose your plan", public: true },
  "/verify-email": { mustInclude: "verify-email-page", public: true },
  "/post-verify": {
    mustInclude: [
      "data-testid=\"app-sidebar\"",
      "verify-email-page",
    ],
  },
  "/forgot-password": { mustInclude: "Forgot password", public: true },
  "/reset-password": { mustInclude: "Reset password", public: true },
  "/invite/accept": { mustInclude: "Invalid invitation", public: true },
  "/": { mustInclude: "data-testid=\"app-sidebar\"" },
  "/campaigns": { mustInclude: vocab.campaign.Plural },
  "/campaigns/new": { mustInclude: `New ${vocab.campaign.singular}` },
  "/contacts": { mustInclude: vocab.contact.Plural },
  "/icps": { mustInclude: vocab.icp.Plural },
  "/icps/new": { mustInclude: `New ${vocab.icp.singular}` },
  "/lists": NOT_FOUND,
  "/personas": NOT_FOUND,
  "/personas/new": NOT_FOUND,
  "/products": { mustInclude: vocab.product.Plural },
  "/products/new": { mustInclude: "data-testid=\"assisted-product-intake\"" },
  "/settings": { mustInclude: "Settings" },
  "/settings/account": { mustInclude: "Account Settings" },
  "/settings/billing": { mustInclude: "billing-stripe-hook" },
  // Comped smoke fixture redirects away; unpaid would render the pitch page.
  "/onboarding/subscribe": {
    mustInclude: [
      "onboarding-subscribe-page",
      "data-testid=\"app-sidebar\"",
    ],
  },
  "/settings/cadence": { mustInclude: "Email cadence" },
  "/settings/email": { mustInclude: "email-signature" },
  "/settings/organization": { mustInclude: "Organization" },
  "/settings/usage": { mustInclude: "Usage" },
  "/settings/voice": { mustInclude: "Your Voice" },
  "/support": { mustInclude: "Submit a support request" },
  "/setup": { mustInclude: vocab.product.Plural },
  "/setup/new": { mustInclude: `New ${vocab.product.Singular}` },
  "/no-workspace": { mustInclude: "data-testid=\"app-sidebar\"" },
  "/platform": { mustInclude: "data-testid=\"platform-console-nav\"" },
  "/platform/orgs": { mustInclude: "Organizations" },
  "/platform/orgs/new": { mustInclude: "Create account" },
  "/platform/support": { mustInclude: "Support tickets" },
  "/platform/costs": { mustInclude: "Costs" },
  "/platform/email-templates": { mustInclude: "Email templates" },
  "/platform/billing": { mustInclude: "Billing Config" },
  "/platform/catalog": { mustInclude: "Plan Catalog" },
  "/platform/eula": { mustInclude: "End User License Agreement" },
  "/onboarding/eula": { mustInclude: "onboarding-eula-page" },
};

function expectationForCampaignChild(pathname: string): SmokeExpectation | null {
  if (!pathname.startsWith("/campaigns/")) return null;
  if (pathname.endsWith("/score")) return null;
  if (
    /\/(setup|list|companies|contacts|emails|report)$/.test(pathname)
  ) {
    return NOT_FOUND;
  }
  return { mustInclude: vocab.campaign.Singular };
}

function expectationForSetupChild(pathname: string): SmokeExpectation | null {
  if (!pathname.startsWith("/setup/")) return null;
  if (pathname.includes("/research/resynthesis/")) {
    return { mustInclude: "product-resynthesis-review" };
  }
  if (pathname.includes("/rebuild/")) {
    return { mustInclude: "persona-resynthesis-review" };
  }
  if (pathname.includes("/personas/")) {
    return NOT_FOUND;
  }
  if (pathname.includes("/icps/new")) {
    return { mustInclude: `Add ${vocab.icp.singular}` };
  }
  if (pathname.includes("/icps/")) {
    return { mustInclude: vocab.icp.singular };
  }
  if (pathname.includes("/research")) {
    return { mustInclude: "Research:" };
  }
  if (pathname.endsWith("/edit")) {
    return { mustInclude: "Edit:" };
  }
  return { mustInclude: vocab.product.Singular };
}

export function smokeExpectationForPath(pathname: string): SmokeExpectation {
  const exact = ROUTE_EXPECTATIONS[pathname];
  if (exact) return exact;

  const campaign = expectationForCampaignChild(pathname);
  if (campaign) return campaign;

  const setup = expectationForSetupChild(pathname);
  if (setup) return setup;

  if (pathname.startsWith("/lists/")) {
    return NOT_FOUND;
  }
  if (pathname.startsWith("/companies/")) {
    return { mustInclude: "Company briefing" };
  }
  if (pathname.startsWith("/scoring/")) {
    return NOT_FOUND;
  }
  if (pathname.startsWith("/platform/orgs/") && pathname.endsWith("/view")) {
    return { mustInclude: "data-testid=\"platform-console-nav\"" };
  }
  if (pathname.startsWith("/platform/orgs/")) {
    return { mustInclude: "Organization" };
  }
  if (pathname.startsWith("/platform/support/")) {
    return { mustInclude: "Captured context" };
  }

  return { mustInclude: "data-testid=\"app-sidebar\"" };
}
