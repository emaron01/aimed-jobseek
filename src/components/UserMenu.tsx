"use client";

import { AppButton } from "@/components/AppButton";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/account";
import { switchActiveOrganizationAction } from "@/app/actions/workspace";
import type { UserMenuModel } from "@/lib/auth/user-menu";

export function UserMenu({ model }: { model: UserMenuModel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const pathname = usePathname() || "/";
  const showSwitcher = model.workspaces.length > 1;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <AppButton
        type="button"
        className="flex items-center gap-3 rounded-md px-1 py-1 text-left hover:bg-slate-50"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-slate-900">
            {model.displayName || model.email}
          </p>
          <p className="text-xs text-slate-500">
            {model.organizationName
              ? model.organizationName
              : model.platformRoleLabel
                ? "Platform"
                : "Account"}
          </p>
        </div>
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white"
          aria-hidden
        >
          {model.avatarInitial}
        </div>
      </AppButton>

      {open ? (
        <div
          id={menuId}
          role="menu"
          data-testid="user-menu"
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            {model.displayName ? (
              <p className="text-sm font-medium text-slate-900">
                {model.displayName}
              </p>
            ) : null}
            <p className="truncate text-sm text-slate-600">{model.email}</p>
            {model.organizationName ? (
              <p className="mt-1 text-xs text-slate-500">
                Workspace: {model.organizationName}
              </p>
            ) : null}
            {model.platformRoleLabel ? (
              <p className="mt-1 text-xs font-medium text-slate-700">
                Role: {model.platformRoleLabel}
              </p>
            ) : null}
          </div>

          {showSwitcher ? (
            <div
              className="border-b border-slate-100 py-1"
              data-testid="workspace-switcher"
            >
              <p className="px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                Workspaces
              </p>
              {model.workspaces.map((ws) =>
                ws.isActive ? (
                  <div
                    key={ws.organizationId}
                    role="menuitem"
                    aria-current="true"
                    data-testid={`workspace-option-${ws.organizationId}`}
                    className="flex items-center justify-between px-4 py-2 text-sm text-slate-900"
                  >
                    <span className="truncate font-medium">{ws.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-slate-500">
                      Current
                    </span>
                  </div>
                ) : (
                  <form
                    key={ws.organizationId}
                    action={switchActiveOrganizationAction}
                  >
                    <input
                      type="hidden"
                      name="organizationId"
                      value={ws.organizationId}
                    />
                    <AppButton
                      type="submit"
                      role="menuitem"
                      data-testid={`workspace-option-${ws.organizationId}`}
                      className="w-full truncate px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {ws.name}
                    </AppButton>
                  </form>
                ),
              )}
            </div>
          ) : null}

          <div className="py-1">
            {model.links
              .filter((link) => link.id !== "log_out")
              .map((link) => (
                <Link
                  key={link.id}
                  href={
                    link.id === "support"
                      ? `${link.href}?from=${encodeURIComponent(pathname)}`
                      : link.href
                  }
                  role="menuitem"
                  data-testid={`user-menu-${link.id}`}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
          </div>

          <div className="border-t border-slate-100 p-1">
            <form action={logoutAction}>
              <AppButton
                type="submit"
                role="menuitem"
                data-testid="user-menu-log_out"
                className="w-full rounded-sm px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Log Out
              </AppButton>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
