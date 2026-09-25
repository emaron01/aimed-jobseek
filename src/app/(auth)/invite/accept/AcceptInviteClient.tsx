"use client";

import { useActionState } from "react";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, AppButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  acceptInviteAction,
  logoutForInviteAction,
  type AcceptInviteActionResult,
} from "@/app/actions/invite";

/**
 * Logged-in accept UI — POST via Server Action so token lookup runs outside
 * RSC render (page render must not mutate cookies or accept as a side effect).
 */
export function AcceptInviteClient({
  token,
  invitedEmail,
  signedInEmail,
  organizationName,
  emailMatches,
}: {
  token: string;
  invitedEmail: string;
  signedInEmail: string;
  organizationName: string;
  emailMatches: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    AcceptInviteActionResult | null,
    FormData
  >(acceptInviteAction, null);

  const returnTo = `/invite/accept?token=${encodeURIComponent(token)}`;

  if (!emailMatches) {
    return (
      <div className="space-y-4" data-testid="invite-accept-email-mismatch">
        <p className="text-sm text-slate-700">
          This invitation is for{" "}
          <span className="font-medium text-slate-900">{invitedEmail}</span>
          {organizationName ? (
            <>
              {" "}
              to join <span className="font-medium">{organizationName}</span>
            </>
          ) : null}
          . You are signed in as{" "}
          <span className="font-medium text-slate-900">{signedInEmail}</span>.
        </p>
        <p className="text-sm text-slate-600">
          Sign out, then create an account (or sign in) as{" "}
          <span className="font-medium">{invitedEmail}</span> to join{" "}
          <span className="font-medium">{organizationName}</span>.
        </p>
        <form action={logoutForInviteAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="next" value={returnTo} />
          <AppButton
            type="submit"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
            data-testid="invite-accept-switch-account"
          >
            Sign out and continue
          </AppButton>
        </form>
        <p className="text-sm text-slate-600">
          After sign-out, choose{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(returnTo)}&email=${encodeURIComponent(invitedEmail)}&company=${encodeURIComponent(organizationName)}`}
            className="font-medium underline"
          >
            Create account
          </Link>{" "}
          if you are new, or Sign in if you already use {invitedEmail}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="invite-accept-form">
      <p className="text-sm text-slate-600">
        Signed in as <span className="font-medium text-slate-900">{signedInEmail}</span>.
        Accept to join{" "}
        <span className="font-medium text-slate-900">{organizationName}</span>.
      </p>
      <form action={formAction}>
        <input type="hidden" name="token" value={token} />
        <AppButton
          type="submit"
          disabled={pending}
          className={cn(PRIMARY_BUTTON_CLASS, "!px-3")}
          data-testid="invite-accept-submit"
        >
          {pending ? "Joining…" : "Accept invitation"}
        </AppButton>
      </form>
      {state && !state.ok ? (
        <p className="text-sm text-red-600" role="alert">
          {state.message}
        </p>
      ) : null}
      <form action={logoutForInviteAction}>
        <input type="hidden" name="next" value={returnTo} />
        <AppButton type="submit" className={cn(SECONDARY_BUTTON_CLASS, "!px-3", "text-xs")}>
          Use a different account
        </AppButton>
      </form>
      <p
        className="hidden"
        data-testid="invite-accept-token"
        data-token={token}
      >
        invite-accept
      </p>
    </div>
  );
}
