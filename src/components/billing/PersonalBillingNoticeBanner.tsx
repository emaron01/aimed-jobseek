"use client";

import { useActionState, useId, useState } from "react";
import {
  cancelOwnedOrgSubscriptionAction,
  dismissPersonalBillingNoticeAction,
  openOwnedOrgBillingPortalAction,
  type WorkspaceActionResult,
} from "@/app/actions/workspace";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";

export type PersonalBillingNoticeOrg = {
  organizationId: string;
  name: string;
  planLabel: string;
};

const initialCancel: WorkspaceActionResult | null = null;

/**
 * Persistent notice when the user still owns a billed personal Standard
 * workspace while working in another org (typically after joining a Team).
 * Does not block invite accept; cancel is explicit and confirmed.
 */
export function PersonalBillingNoticeBanner({
  orgs,
}: {
  orgs: PersonalBillingNoticeOrg[];
}) {
  if (orgs.length === 0) return null;

  return (
    <div
      role="status"
      className="border-b border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950"
      data-testid="personal-billing-notice"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        {orgs.map((org) => (
          <PersonalBillingNoticeRow key={org.organizationId} org={org} />
        ))}
      </div>
    </div>
  );
}

function PersonalBillingNoticeRow({ org }: { org: PersonalBillingNoticeOrg }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelOwnedOrgSubscriptionAction,
    initialCancel,
  );

  const planLabel = org.planLabel;

  if (cancelState?.ok) {
    return (
      <p className="text-sm text-sky-950" data-testid="personal-billing-canceled">
        {cancelState.message}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid={`personal-billing-notice-${org.organizationId}`}>
      <p>
        You still have an active {planLabel} subscription on{" "}
        <span className="font-medium">{org.name}</span>. Joining this workspace did
        not cancel it — you are still being billed for that Standard plan. Switch
        workspaces in the user menu to keep using it, or cancel that subscription
        if you no longer need it. Your data there stays until you delete the
        workspace.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <form action={openOwnedOrgBillingPortalAction}>
          <input type="hidden" name="organizationId" value={org.organizationId} />
          <AppButton type="submit" className={cn(PRIMARY_BUTTON_CLASS, "!px-3 !py-1.5 !text-sm")}>
            Manage / cancel in Stripe
          </AppButton>
        </form>
        <AppButton
          type="button"
          className={cn(SECONDARY_BUTTON_CLASS, "!px-3 !py-1.5 !text-sm")}
          onClick={() => setConfirmOpen((v) => !v)}
        >
          {confirmOpen ? "Hide cancel form" : "Cancel Standard here"}
        </AppButton>
        <form action={dismissPersonalBillingNoticeAction}>
          <input type="hidden" name="organizationId" value={org.organizationId} />
          <AppButton
            type="submit"
            className="text-sm font-medium text-sky-900 underline underline-offset-2"
          >
            Keep for now
          </AppButton>
        </form>
      </div>

      {confirmOpen ? (
        <form action={cancelAction} className="space-y-2 rounded-md border border-sky-200 bg-white/70 p-3">
          <input type="hidden" name="organizationId" value={org.organizationId} />
          <label htmlFor={confirmId} className="block text-sm text-slate-700">
            Type <span className="font-mono font-semibold">CANCEL</span> to cancel
            the {planLabel} subscription for {org.name}. This stops billing; it
            does not delete your workspace data.
          </label>
          <input
            id={confirmId}
            name="confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            data-testid="personal-billing-cancel-confirm"
          />
          <AppButton
            type="submit"
            disabled={cancelPending || confirmText !== "CANCEL"}
            className={cn(
              PRIMARY_BUTTON_CLASS,
              "!bg-red-700 !px-3 !py-1.5 !text-sm hover:!bg-red-800 disabled:opacity-50",
            )}
          >
            {cancelPending ? "Canceling…" : "Cancel subscription"}
          </AppButton>
          {cancelState && !cancelState.ok ? (
            <p className="text-sm text-red-700">{cancelState.message}</p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
