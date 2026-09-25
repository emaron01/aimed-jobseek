"use client";
import { PRIMARY_BUTTON_CLASS, AppButton } from "@/components/ui";
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
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">Microsoft 365</h2>
      <p className="mt-1 text-sm text-slate-600">
        Sends from your own authenticated mailbox and saves accepted messages
        to your Sent items. The app does not relay mail.
      </p>

      {notice ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {notice}
        </p>
      ) : null}
      {result ? (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            result.ok
              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <div className="mt-5">
        {connected ? (
          <>
            <p className="text-sm font-medium text-emerald-800">
              Connected as {connection.mailboxAddress}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Connected {new Date(connection.connectedAt).toLocaleString()}
            </p>
          </>
        ) : connection?.status === "RECONNECT_REQUIRED" ? (
          <p className="text-sm font-medium text-amber-800">
            Reconnect required for {connection.mailboxAddress}
          </p>
        ) : (
          <p className="text-sm text-slate-700">Not connected.</p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {!connected ? (
          <a
            href="/api/mailbox/microsoft/connect?returnTo=/settings/email"
            className={cn(PRIMARY_BUTTON_CLASS, "!px-4")}
          >
            {connection ? "Reconnect Microsoft 365" : "Connect Microsoft 365"}
          </a>
        ) : null}
        {connection ? (
          <form action={action}>
            <AppButton
              type="submit"
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </AppButton>
          </form>
        ) : null}
      </div>
    </section>
  );
}
