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
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-on-nav/15 bg-nav text-on-nav print:hidden">
      <div className="border-b border-on-nav/15 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-on-nav/70">
          {brand.lockupEyebrow}
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-on-nav">
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
                  className="my-2 border-t border-on-nav/15"
                  aria-hidden="true"
                />
              ) : null}
              <Link
                href={item.href}
                data-testid={`sidebar-${item.href}`}
                className={cn(
                  "block rounded-md bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors",
                  active ? "bg-surface text-ink" : "hover:bg-surface",
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
