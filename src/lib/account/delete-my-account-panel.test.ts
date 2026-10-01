// @vitest-environment happy-dom
/**
 * Account settings Delete my account panel (lifecycle B4 finish).
 */
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE_MY_ACCOUNT_FAILURE_MESSAGE } from "@/lib/account/delete-my-account";

const deleteMyAccountAction = vi.fn(async () => ({
  ok: false as const,
  message: DELETE_MY_ACCOUNT_FAILURE_MESSAGE,
}));

vi.mock("@/app/actions/account", () => ({
  deleteMyAccountAction: (
    prev: unknown,
    formData: FormData,
  ) => deleteMyAccountAction(prev, formData),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));

import { AccountSettingsDeleteSection } from "@/components/DeleteMyAccountPanel";

function mount(node: ReactNode): { host: HTMLElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("Account settings delete panel", () => {
  let root: Root | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    deleteMyAccountAction.mockClear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it("shows the delete section to the owner and hides it from a non-owner", () => {
    const owner = mount(
      createElement(AccountSettingsDeleteSection, { isOwner: true }),
    );
    expect(
      owner.host.querySelector("[data-testid='delete-my-account-panel']"),
    ).toBeTruthy();
    expect(owner.host.textContent).toContain("Delete my account");
    act(() => {
      owner.root.unmount();
    });

    const member = mount(
      createElement(AccountSettingsDeleteSection, { isOwner: false }),
    );
    root = member.root;
    expect(
      member.host.querySelector("[data-testid='delete-my-account-panel']"),
    ).toBeNull();
    expect(member.host.textContent ?? "").not.toContain("Delete my account");
  });

  it("keeps the button disabled until DELETE is typed, and cancel closes the dialog", () => {
    const view = mount(
      createElement(AccountSettingsDeleteSection, { isOwner: true }),
    );
    root = view.root;
    const open = view.host.querySelector(
      "[data-testid='delete-my-account-open']",
    ) as HTMLButtonElement;
    act(() => {
      open.click();
    });
    expect(view.host.textContent).toContain(
      "This permanently deletes your account and everything in it: your profile, applications, Harper coaching, cheat sheets, resumes, and messages. This can't be undone.",
    );
    const submit = () =>
      view.host.querySelector(
        "[data-testid='delete-my-account-submit']",
      ) as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    expect(submit().textContent).toContain("Permanently delete my account");

    const input = view.host.querySelector(
      "[data-testid='delete-my-account-confirm-input']",
    ) as HTMLInputElement;
    act(() => {
      typeInto(input, "delete");
    });
    expect(submit().disabled).toBe(true);

    act(() => {
      typeInto(input, "DELETE");
    });
    expect(submit().disabled).toBe(false);

    const cancel = view.host.querySelector(
      "[data-testid='delete-my-account-cancel']",
    ) as HTMLButtonElement;
    act(() => {
      cancel.click();
    });
    expect(
      view.host.querySelector("[data-testid='delete-my-account-confirm']"),
    ).toBeNull();
    expect(
      view.host.querySelector("[data-testid='delete-my-account-open']"),
    ).toBeTruthy();
  });

  it("shows the exact failure message with a support link and keeps the seeker signed in", async () => {
    const view = mount(
      createElement(AccountSettingsDeleteSection, { isOwner: true }),
    );
    root = view.root;
    act(() => {
      (
        view.host.querySelector(
          "[data-testid='delete-my-account-open']",
        ) as HTMLButtonElement
      ).click();
    });
    const input = view.host.querySelector(
      "[data-testid='delete-my-account-confirm-input']",
    ) as HTMLInputElement;
    act(() => {
      typeInto(input, "DELETE");
    });
    const form = view.host.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    const error = view.host.querySelector(
      "[data-testid='delete-my-account-error']",
    ) as HTMLElement;
    expect(error.textContent).toBe(DELETE_MY_ACCOUNT_FAILURE_MESSAGE);
    const link = error.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/support");
    expect(link?.textContent).toBe("contact support");
    expect(error.textContent).not.toContain("/support");
    expect(deleteMyAccountAction).toHaveBeenCalled();
  });
});
