"use client";

import Link from "next/link";
import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ApplicationSidebarTracker } from "@/components/ApplicationSidebarTracker";
import type { SidebarNavItem } from "@/lib/auth/user-menu";
import { brand } from "@/lib/product-config";

export function applicationSidebarCampaignId(
  pathname: string,
  applicationFilter: string | null,
): string | null {
  const fromPath = campaignIdFromPathname(pathname);
  if (fromPath) return fromPath;
  const filter = applicationFilter?.trim();
  if (pathname === "/contacts" && filter) return filter;
  return null;
}

function campaignIdFromPathname(pathname: string): string | null {
  const match = pathname.match(/^\/campaigns\/([^/]+)/);
  if (!match) return null;
  const id = match[1];
  if (!id || id === "new") return null;
  return id;
}

function sidebarItemMatchLength(item: SidebarNavItem, pathname: string): number {
  if (item.href === "/") return pathname === "/" ? 1 : 0;
  // An open application has its own nav item. Applications is the list page.
  if (item.href === "/campaigns") {
    return pathname === "/campaigns" || pathname === "/campaigns/new"
      ? item.href.length
      : 0;
  }
  const prefixes = [item.href, ...(item.activePrefixes ?? [])];
  let best = 0;
  for (const prefix of prefixes) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      best = Math.max(best, prefix.length);
    }
  }
  return best;
}

function sidebarItemKey(item: SidebarNavItem): string {
  return `${item.href}\0${item.label}`;
}

function currentSidebarKey(
  items: SidebarNavItem[],
  pathname: string,
): string | null {
  let key: string | null = null;
  let length = 0;
  for (const item of items) {
    const match = sidebarItemMatchLength(item, pathname);
    if (match > length) {
      length = match;
      key = sidebarItemKey(item);
    }
  }
  return key;
}

function ApplicationSidebarSlot() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  const campaignId = applicationSidebarCampaignId(
    pathname,
    searchParams.get("campaignId") || searchParams.get("application"),
  );
  if (!campaignId) return null;
  return (
    <div className="hidden md:block">
      <ApplicationSidebarTracker campaignId={campaignId} />
    </div>
  );
}

export function Sidebar({ items }: { items: SidebarNavItem[] }) {
  const pathname = usePathname() || "";
  const currentKey = currentSidebarKey(items, pathname);

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
      <Suspense fallback={null}>
        <ApplicationSidebarSlot />
      </Suspense>
      <nav className="flex flex-1 flex-col gap-0.5 p-3" data-testid="app-sidebar">
        {items.map((item) => {
          const current = sidebarItemKey(item) === currentKey;

          return (
            <div key={`${item.href}-${item.label}`}>
              {item.separatorBefore ? (
                <div
                  className="my-2 border-t border-on-nav/15"
                  aria-hidden="true"
                />
              ) : null}
              <Link
                href={item.href}
                data-testid={`sidebar-${item.href}`}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm font-medium text-ink transition-colors",
                  current
                    ? "bg-primary-tint text-ink"
                    : "bg-surface text-ink hover:bg-surface active:bg-primary-tint",
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
