"use client";
import {AppButton, AppActionLink } from "@/components/ui";
import { cn } from "@/lib/utils";

import { useActionState } from "react";
import {
  disconnectMicrosoftMailboxAction,
  type MailboxConnectionActionResult,
} from "@/app/actions/mailbox";

export function MailboxConnectionPanel({
  connection,
  notice,
}: {
  connection: {
    status: "CONNECTED" | "RECONNECT_REQUIRED";
    mailboxAddress: string;
    connectedAt: string;
  } | null;
  notice: string | null;
}) {
  const [result, action, pending] = useActionState<
    MailboxConnectionActionResult | null,
    FormData
  >(disconnectMicrosoftMailboxAction, null);
  const connected = connection?.status === "CONNECTED";

  return (
    <section className="rounded-lg border border-edge bg-surface p-5">
      <h2 className="text-lg font-semibold text-ink">Microsoft 365</h2>
      <p className="mt-1 text-sm text-muted">
        Sends from your own authenticated mailbox and saves accepted messages
        to your Sent items. The app does not relay mail.
      </p>

      {notice ? (
        <p className="mt-4 rounded-md border border-warning bg-warning-tint px-3 py-2 text-sm text-warning">
          {notice}
        </p>
      ) : null}
      {result ? (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            result.ok
              ? "border border-success bg-success-tint text-success"
              : "border border-danger bg-danger-tint text-danger"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <div className="mt-5">
        {connected ? (
          <>
            <p className="text-sm font-medium text-success">
              Connected as {connection.mailboxAddress}
            </p>
            <p className="mt-1 text-xs text-subtle">
              Connected {new Date(connection.connectedAt).toLocaleString()}
            </p>
          </>
        ) : connection?.status === "RECONNECT_REQUIRED" ? (
          <p className="text-sm font-medium text-warning">
            Reconnect required for {connection.mailboxAddress}
          </p>
        ) : (
          <p className="text-sm text-ink">Not connected.</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {!connected ? (
          <AppActionLink
            href="/api/mailbox/microsoft/connect?returnTo=/settings/email"
            variant="primary" className={cn("!px-4")}
          >
            {connection ? "Reconnect Microsoft 365" : "Connect Microsoft 365"}
          </AppActionLink>
        ) : null}
        {connection ? (
          <form action={action}>
            <AppButton
              type="submit"
              disabled={pending}
              className="rounded-md border border-edge-strong px-4 py-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:text-subtle"
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </AppButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}
