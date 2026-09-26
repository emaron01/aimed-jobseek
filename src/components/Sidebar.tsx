"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ApplicationSidebarTracker } from "@/components/ApplicationSidebarTracker";
import type { SidebarNavItem } from "@/lib/auth/user-menu";
import { brand } from "@/lib/product-config";

function campaignIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  if (!match) return null;
  const id = match[1];
  if (!id || id === "new") return null;
  return id;
}

function isSidebarItemActive(item: SidebarNavItem, pathname: string): boolean {
  if (item.href === "/") {
    return pathname === "/";
  }

  const prefixes = [item.href, ...(item.activePrefixes ?? [])];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function Sidebar({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname() || "";
  const campaignId = campaignIdFromPathname(pathname);

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-ink bg-ink text-on-ink print:hidden">
      <div className="border-b border-on-ink/15 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-on-ink/70">
          {brand.lockupEyebrow}
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-on-ink">
          {brand.appName}
        </h1>
      </div>
      {campaignId ? (
        <div className="hidden md:block">
          <ApplicationSidebarTracker campaignId={campaignId} />
        </div>
      ) : null}
      <nav className="flex flex-1 flex-col gap-0.5 p-3" data-testid="app-sidebar">
        {items.map((item) => {
          const active = isSidebarItemActive(item, pathname);

          return (
            <div key={item.href}>
              {item.separatorBefore ? (
                <div
                  className="my-2 border-t border-on-ink/15"
                  aria-hidden="true"
                />
              ) : null}
              <Link
                href={item.href}
                data-testid={`sidebar-${item.href}`}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-on-primary"
                    : "text-on-ink/85 hover:bg-on-ink/10",
                )}
              >
                {item.label}
              </Link>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
