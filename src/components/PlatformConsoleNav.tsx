"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PlatformRole } from "@prisma/client";
import { PLATFORM_ROUTE_AUDIT } from "@/lib/platform/route-audit";

export { PLATFORM_ROUTE_AUDIT };

const PLATFORM_NAV_ITEMS = [
  { href: "/platform", label: "Home", match: "exact" as const },
  { href: "/platform/orgs", label: "Organizations", match: "prefix" as const },
  { href: "/platform/support", label: "Support", match: "prefix" as const },
  { href: "/platform/costs", label: "Costs & margin", match: "exact" as const },
  { href: "/platform/ai", label: "AI configuration", match: "exact" as const },
  {
    href: "/platform/email-templates",
    label: "Email templates",
    match: "exact" as const,
    superAdminOnly: true,
  },
  {
    href: "/platform/billing",
    label: "Billing Config",
    match: "exact" as const,
    superAdminOnly: true,
  },
  {
    href: "/platform/catalog",
    label: "Plan Catalog",
    match: "exact" as const,
    superAdminOnly: true,
  },
  {
    href: "/platform/eula",
    label: "EULA",
    match: "exact" as const,
    superAdminOnly: true,
  },
] as const;

function itemsForRole(platformRole: PlatformRole) {
  return PLATFORM_NAV_ITEMS.filter(
    (item) =>
      !("superAdminOnly" in item && item.superAdminOnly) ||
      platformRole === "SUPER_ADMIN",
  );
}

export function PlatformConsoleNav({
  platformRole,
}: {
  platformRole: PlatformRole;
}) {
  const pathname = usePathname() || "/platform";
  const items = itemsForRole(platformRole);

  return (
    <nav
      aria-label="Platform console"
      className="mb-6 flex flex-wrap gap-1 border-b border-edge pb-3 text-sm"
      data-testid="platform-console-nav"
    >
      {items.map((item) => {
        const active =
          item.match === "exact"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-1.5 font-medium ${
              active
                ? "bg-ink text-on-ink"
                : "text-ink hover:bg-canvas"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
