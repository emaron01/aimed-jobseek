"use client";

import { AppButton } from "@/components/AppButton";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { logoutAction, deleteMyAccountAction } from "@/app/actions/account";
import { switchActiveOrganizationAction } from "@/app/actions/workspace";
import type { UserMenuModel } from "@/lib/auth/user-menu";
import {
  DELETE_MY_ACCOUNT_BUTTON_LABEL,
  DELETE_MY_ACCOUNT_CONFIRM_BODY,
  DELETE_MY_ACCOUNT_CONFIRM_PHRASE,
  DELETE_MY_ACCOUNT_MENU_LABEL,
} from "@/lib/account/delete-my-account";

function DeleteMyAccountMenuItem() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, formAction, pending] = useActionState(
    deleteMyAccountAction,
    null,
  );
  const titleId = useId();
  const inputId = useId();
  const matches = confirmation === DELETE_MY_ACCOUNT_CONFIRM_PHRASE;

  if (!open && confirmation) {
    setConfirmation("");
  }

  return (
    <div data-testid="user-menu-delete_my_account-wrap">
      {!open ? (
        <AppButton
          type="button"
          variant="secondary"
          role="menuitem"
          data-testid="user-menu-delete_my_account"
          className="w-full !justify-start !px-4 !py-2 text-danger hover:bg-canvas"
          onClick={() => setOpen(true)}
        >
          {DELETE_MY_ACCOUNT_MENU_LABEL}
        </AppButton>
      ) : (
        <div
          className="space-y-3 border-t border-edge bg-danger-tint/40 px-4 py-3"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid="delete-my-account-confirm"
        >
          <p id={titleId} className="text-sm text-ink">
            {DELETE_MY_ACCOUNT_CONFIRM_BODY}
          </p>
          <form action={formAction} className="space-y-3">
            <label htmlFor={inputId} className="block text-sm text-ink">
              Type{" "}
              <span className="font-mono font-semibold">
                {DELETE_MY_ACCOUNT_CONFIRM_PHRASE}
              </span>{" "}
              to confirm
              <input
                id={inputId}
                name="confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-edge-strong px-3 py-2 font-mono text-sm"
                data-testid="delete-my-account-confirm-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <AppButton
                type="submit"
                variant="danger"
                disabled={!matches || pending}
                data-testid="delete-my-account-submit"
              >
                {pending ? "Deleting…" : DELETE_MY_ACCOUNT_BUTTON_LABEL}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                disabled={pending}
                data-testid="delete-my-account-cancel"
                onClick={() => {
                  setOpen(false);
                  setConfirmation("");
                }}
              >
                Cancel
              </AppButton>
            </div>
          </form>
          {state && !state.ok ? (
            <p
              className="text-sm text-danger"
              role="alert"
              data-testid="delete-my-account-error"
            >
              {state.message}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

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
        variant="secondary"
        className="gap-3 !px-2 !py-1"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink">
            {model.displayName || model.email}
          </p>
          <p className="text-xs text-muted">
            {model.organizationName
              ? model.organizationName
              : model.platformRoleLabel
                ? "Platform"
                : "Account"}
          </p>
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-on-primary"
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
          className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-edge bg-surface shadow-md"
        >
          <div className="border-b border-edge px-4 py-3">
            {model.displayName ? (
              <p className="text-sm font-medium text-ink">
                {model.displayName}
              </p>
            ) : null}
            <p className="truncate text-sm text-muted">{model.email}</p>
            {model.organizationName ? (
              <p className="mt-1 text-xs text-subtle">
                Workspace: {model.organizationName}
              </p>
            ) : null}
            {model.platformRoleLabel ? (
              <p className="mt-1 text-xs font-medium text-ink">
                Role: {model.platformRoleLabel}
              </p>
            ) : null}
          </div>

          {showSwitcher ? (
            <div
              className="border-b border-edge py-1"
              data-testid="workspace-switcher"
            >
              <p className="px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-subtle">
                Workspaces
              </p>
              {model.workspaces.map((ws) =>
                ws.isActive ? (
                  <div
                    key={ws.organizationId}
                    role="menuitem"
                    aria-current="true"
                    data-testid={`workspace-option-${ws.organizationId}`}
                    className="flex items-center justify-between px-4 py-2 text-sm text-ink"
                  >
                    <span className="truncate font-medium">{ws.name}</span>
                    <span className="ml-2 shrink-0 text-xs text-subtle">
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
                      variant="secondary"
                      role="menuitem"
                      data-testid={`workspace-option-${ws.organizationId}`}
                      className="w-full !justify-start truncate"
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
              .filter(
                (link) =>
                  link.id !== "log_out" && link.id !== "delete_my_account",
              )
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
                  className="block px-4 py-2 text-sm text-ink hover:bg-canvas"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            {model.links.some((link) => link.id === "delete_my_account") ? (
              <DeleteMyAccountMenuItem />
            ) : null}
          </div>

          <div className="border-t border-edge p-1">
            <form action={logoutAction}>
              <AppButton
                type="submit"
                variant="secondary"
                role="menuitem"
                data-testid="user-menu-log_out"
                className="w-full !justify-start"
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
